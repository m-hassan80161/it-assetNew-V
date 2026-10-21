import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  AgentRegistrationStatus,
  NetworkInterfaceType,
} from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { InventoryService } from "./inventory.service";
import { InventoryPayloadDto } from "./dto/inventory-payload.dto";

function createService(transaction: Record<string, any>) {
  const prisma = {
    $transaction: jest.fn(
      (callback: (tx: Record<string, any>) => unknown) => callback(transaction),
    ),
    agentAuditEvent: { create: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
  return { service: new InventoryService(prisma), prisma };
}

describe("InventoryService managed-device safeguards", () => {
  it("keeps legacy upserts keyed by the exact hostname and preserves Device.id", async () => {
    const tx = {
      device: {
        upsert: jest
          .fn()
          .mockResolvedValueOnce({
            id: "existing-device-id",
            computerName: "HOST-01",
          })
          .mockResolvedValueOnce({
            id: "case-distinct-device-id",
            computerName: "host-01",
          }),
        findFirst: jest.fn(),
      },
      cpuInfo: { upsert: jest.fn().mockResolvedValue({}) },
      motherboardInfo: { upsert: jest.fn().mockResolvedValue({}) },
      ramModule: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      diskDrive: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      installedSoftware: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const { service } = createService(tx);

    const payload: InventoryPayloadDto = {
      computerName: "HOST-01",
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
    };
    await expect(service.ingest(payload)).resolves.toEqual({
      deviceId: "existing-device-id",
      status: "ok",
    });
    await expect(
      service.ingest({ ...payload, computerName: "host-01" }),
    ).resolves.toEqual({
      deviceId: "case-distinct-device-id",
      status: "ok",
    });

    expect(tx.device.upsert).toHaveBeenNthCalledWith(1,
      expect.objectContaining({
        where: { computerName: "HOST-01" },
      }),
    );
    expect(tx.device.upsert).toHaveBeenNthCalledWith(2,
      expect.objectContaining({
        where: { computerName: "host-01" },
      }),
    );
    expect(tx.device.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ["NUL", "\u0000"],
    ["tab", "\t"],
    ["newline", "\r\n"],
    ["DEL", "\u007f"],
    ["C1", "\u0085"],
  ])("rejects %s in computerName before opening a transaction", async (_label, control) => {
    const { service, prisma } = createService({});

    await expect(
      service.ingest({
        computerName: `HOST-01${control}forged-log-entry`,
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
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects deletion of a device with an enabled managed agent", async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "device-1" }]),
      managedAgent: {
        findUnique: jest.fn().mockResolvedValue({
          id: "agent-1",
          status: AgentRegistrationStatus.ENABLED,
        }),
      },
      agentAuditEvent: { create: jest.fn() },
      device: { delete: jest.fn() },
    };
    const { service } = createService(tx);

    await expect(service.deleteDevice("device-1")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.device.delete).not.toHaveBeenCalled();
    expect(tx.agentAuditEvent.create).not.toHaveBeenCalled();
  });

  it("retains the registration and audit reference when a deactivated device is deleted", async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "device-1" }]),
      managedAgent: {
        findUnique: jest.fn().mockResolvedValue({
          id: "agent-1",
          status: AgentRegistrationStatus.DISABLED,
        }),
      },
      agentAuditEvent: { create: jest.fn().mockResolvedValue({}) },
      device: { delete: jest.fn().mockResolvedValue({}) },
    };
    const { service } = createService(tx);

    await expect(
      service.deleteDevice("device-1", { id: "admin-1", username: "admin" }),
    ).resolves.toEqual({ id: "device-1", status: "deleted" });
    expect(tx.agentAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        agentId: "agent-1",
        deviceId: "device-1",
        eventType: "DEVICE_DELETED",
        actorAdminId: "admin-1",
        details: { registrationStatus: AgentRegistrationStatus.DISABLED },
      }),
    });
    expect(tx.device.delete).toHaveBeenCalledWith({ where: { id: "device-1" } });
  });

  it("preserves the legacy endpoint boundary for optional network data", async () => {
    const tx = {};
    const { service, prisma } = createService(tx);
    const payload = {
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
          ipAddresses: [],
        },
      ],
    } satisfies InventoryPayloadDto;

    await expect(service.ingest(payload)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns not found when deleting an unknown device", async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      managedAgent: { findUnique: jest.fn() },
      device: { delete: jest.fn() },
    };
    const { service } = createService(tx);

    await expect(service.deleteDevice("missing-device")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.device.delete).not.toHaveBeenCalled();
  });
});

describe("managed inventory revisions", () => {
  const payload = {
    computerName: "managed-host",
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
  } satisfies InventoryPayloadDto;

  function revisionTransaction(
    registration: {
      id: string;
      inventoryRevision: bigint;
      lastAppliedInventoryRevision: bigint | null;
      lastAppliedInventoryHash: string | null;
    },
  ) {
    return {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "device-1" }]),
      device: {
        update: jest.fn().mockResolvedValue({
          id: "device-1",
          computerName: "managed-host",
        }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      managedAgent: {
        findFirst: jest.fn().mockResolvedValue(registration),
        update: jest.fn().mockResolvedValue({}),
      },
      cpuInfo: { upsert: jest.fn().mockResolvedValue({}) },
      motherboardInfo: { upsert: jest.fn().mockResolvedValue({}) },
      ramModule: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      diskDrive: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      installedSoftware: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
  }

  it("rejects an older snapshot before updating any inventory records", async () => {
    const tx = revisionTransaction({
      id: "agent-1",
      inventoryRevision: 8n,
      lastAppliedInventoryRevision: null,
      lastAppliedInventoryHash: null,
    });
    const { service } = createService(tx);

    await expect(
      service.ingestForManagedAgent("agent-1", "device-1", payload, 7n),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.device.update).not.toHaveBeenCalled();
    expect(tx.cpuInfo.upsert).not.toHaveBeenCalled();
  });

  it("treats a matching retry as idempotent and rejects changed content at that revision", async () => {
    const tx = revisionTransaction({
      id: "agent-1",
      inventoryRevision: 8n,
      lastAppliedInventoryRevision: null,
      lastAppliedInventoryHash: null,
    });
    const { service } = createService(tx);

    await service.ingestForManagedAgent("agent-1", "device-1", payload, 8n);
    const savedHash = tx.managedAgent.update.mock.calls[0][0].data.lastAppliedInventoryHash;
    expect(savedHash).toMatch(/^[a-f0-9]{64}$/);

    tx.managedAgent.findFirst.mockResolvedValue({
      id: "agent-1",
      inventoryRevision: 8n,
      lastAppliedInventoryRevision: 8n,
      lastAppliedInventoryHash: savedHash,
    });
    tx.cpuInfo.upsert.mockClear();
    await expect(
      service.ingestForManagedAgent("agent-1", "device-1", payload, 8n),
    ).resolves.toEqual({
      deviceId: "device-1",
      status: "ok",
      duplicate: true,
    });
    expect(tx.cpuInfo.upsert).not.toHaveBeenCalled();

    await expect(
      service.ingestForManagedAgent(
        "agent-1",
        "device-1",
        { ...payload, loggedInUser: "different-content" },
        8n,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
