import { BadRequestException } from "@nestjs/common";
import {
  NetworkAddressFamily,
  NetworkAddressScope,
  NetworkInterfaceType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { InventoryService } from "./inventory.service";
import { InventoryPayloadDto } from "./dto/inventory-payload.dto";
import {
  normalizeNetworkInterfaces,
  replaceNetworkSnapshot,
} from "./network-inventory";

describe("network inventory normalization", () => {
  it("normalizes MAC and IPv6 values and classifies eligible address scopes", () => {
    const snapshot = normalizeNetworkInterfaces([
      {
        name: " Ethernet 1 ",
        interfaceType: NetworkInterfaceType.ETHERNET,
        macAddress: "02-aa-BB-00-00-01",
        ipAddresses: [
          { address: "192.168.1.10", prefixLength: 24 },
          { address: "169.254.10.2", prefixLength: 16 },
          { address: "2001:0db8:0:0:0:0:0:1", prefixLength: 64 },
          { address: "fe80::1", prefixLength: 64 },
          { address: "fd12:3456::1", prefixLength: 64 },
        ],
      },
    ]);

    expect(snapshot[0]).toMatchObject({
      name: "Ethernet 1",
      interfaceType: NetworkInterfaceType.ETHERNET,
      macAddress: "02:AA:BB:00:00:01",
    });
    expect(snapshot[0].ipAddresses).toEqual([
      {
        address: "192.168.1.10",
        family: NetworkAddressFamily.IPV4,
        prefixLength: 24,
        scope: NetworkAddressScope.PRIVATE,
      },
      {
        address: "169.254.10.2",
        family: NetworkAddressFamily.IPV4,
        prefixLength: 16,
        scope: NetworkAddressScope.APIPA,
      },
      {
        address: "2001:db8::1",
        family: NetworkAddressFamily.IPV6,
        prefixLength: 64,
        scope: NetworkAddressScope.DOCUMENTATION,
      },
      {
        address: "fe80::1",
        family: NetworkAddressFamily.IPV6,
        prefixLength: 64,
        scope: NetworkAddressScope.LINK_LOCAL,
      },
      {
        address: "fd12:3456::1",
        family: NetworkAddressFamily.IPV6,
        prefixLength: 64,
        scope: NetworkAddressScope.UNIQUE_LOCAL,
      },
    ]);
  });

  it("deduplicates equal addresses on one interface and keeps an interface with no addresses", () => {
    const snapshot = normalizeNetworkInterfaces([
      {
        name: "Wi-Fi",
        interfaceType: NetworkInterfaceType.WIFI,
        macAddress: null,
        ipAddresses: [
          { address: "10.1.2.3", prefixLength: 24 },
          { address: "10.1.2.3", prefixLength: 24 },
        ],
      },
      {
        name: "VPN",
        interfaceType: NetworkInterfaceType.VPN,
        macAddress: null,
        ipAddresses: [],
      },
    ]);

    expect(snapshot[0].ipAddresses).toHaveLength(1);
    expect(snapshot[1]).toMatchObject({ name: "VPN", ipAddresses: [] });
  });

  it.each([
    ["unspecified", "0.0.0.0", 0],
    ["loopback", "127.0.0.1", 8],
    ["multicast", "224.0.0.1", 24],
    ["IPv6 loopback", "::1", 128],
    ["IPv6 multicast", "ff02::1", 64],
  ])("rejects %s addresses", (_case, address, prefixLength) => {
    expect(() =>
      normalizeNetworkInterfaces([
        {
          name: "Ethernet",
          interfaceType: NetworkInterfaceType.ETHERNET,
          macAddress: null,
          ipAddresses: [{ address, prefixLength }],
        },
      ]),
    ).toThrow(BadRequestException);
  });

  it("rejects malformed MACs, address prefixes, and duplicate interface names", () => {
    const base = {
      name: "Ethernet",
      interfaceType: NetworkInterfaceType.ETHERNET,
      macAddress: null,
      ipAddresses: [{ address: "10.0.0.2", prefixLength: 24 }],
    };
    expect(() =>
      normalizeNetworkInterfaces([{ ...base, macAddress: "00:00:00:00:00:00" }]),
    ).toThrow(BadRequestException);
    expect(() =>
      normalizeNetworkInterfaces([
        { ...base, ipAddresses: [{ address: "10.0.0.2", prefixLength: 33 }] },
      ]),
    ).toThrow(BadRequestException);
    expect(() =>
      normalizeNetworkInterfaces([base, { ...base, name: "ethernet" }]),
    ).toThrow(BadRequestException);
  });
});

describe("network snapshot persistence semantics", () => {
  it("preserves stored network state when the snapshot is omitted", async () => {
    const tx = {
      networkInterface: {
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
    };

    await replaceNetworkSnapshot(
      tx as unknown as Prisma.TransactionClient,
      "device-1",
      undefined,
    );

    expect(tx.networkInterface.deleteMany).not.toHaveBeenCalled();
    expect(tx.networkInterface.create).not.toHaveBeenCalled();
  });

  it("clears current state for an empty snapshot and retains interfaces without IPs", async () => {
    const tx = {
      networkInterface: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    await replaceNetworkSnapshot(
      tx as unknown as Prisma.TransactionClient,
      "device-1",
      [],
    );
    expect(tx.networkInterface.deleteMany).toHaveBeenCalledWith({
      where: { deviceId: "device-1" },
    });
    expect(tx.networkInterface.create).not.toHaveBeenCalled();

    const [emptyInterface] = normalizeNetworkInterfaces([
      {
        name: "VPN",
        interfaceType: NetworkInterfaceType.VPN,
        macAddress: null,
        ipAddresses: [],
      },
    ]);
    await replaceNetworkSnapshot(
      tx as unknown as Prisma.TransactionClient,
      "device-1",
      [emptyInterface],
    );
    expect(tx.networkInterface.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "VPN",
          ipAddresses: { create: [] },
        }),
      }),
    );
  });

  it("rejects an invalid snapshot before starting inventory persistence", async () => {
    const prisma = {
      $transaction: jest.fn(),
    };
    const service = new InventoryService(prisma as unknown as PrismaService);

    await expect(
      service.ingest({
        computerName: "synthetic-host",
        cpu: {
          model: "Synthetic",
          cores: 1,
          threads: 1,
          clockSpeedMhz: 1000,
          architecture: "x64",
        },
        motherboard: { manufacturer: "Synthetic", model: "Synthetic" },
        ramModules: [],
        disks: [],
        software: [],
        networkInterfaces: [
          {
            name: "Ethernet",
            interfaceType: NetworkInterfaceType.ETHERNET,
            macAddress: null,
            ipAddresses: [{ address: "10.0.0.2", prefixLength: 33 }],
          },
        ],
      } satisfies InventoryPayloadDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
