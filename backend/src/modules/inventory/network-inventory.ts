import { BadRequestException } from "@nestjs/common";
import {
  NetworkAddressFamily,
  NetworkAddressScope,
  NetworkInterfaceType,
  Prisma,
} from "@prisma/client";
import { isIP } from "node:net";
import { NetworkInterfaceDto } from "./dto/network-interface.dto";

export interface NormalizedNetworkAddress {
  address: string;
  family: NetworkAddressFamily;
  prefixLength: number;
  scope: NetworkAddressScope;
}

export interface NormalizedNetworkInterface {
  name: string;
  interfaceType: NetworkInterfaceType;
  macAddress: string | null;
  ipAddresses: NormalizedNetworkAddress[];
}

export function normalizeNetworkInterfaces(
  interfaces: NetworkInterfaceDto[],
): NormalizedNetworkInterface[] {
  if (!Array.isArray(interfaces) || interfaces.length > 64) {
    throw new BadRequestException("Network snapshot has an invalid interface count");
  }

  const names = new Set<string>();
  return interfaces.map((networkInterface) => {
    if (!networkInterface || typeof networkInterface !== "object") {
      throw new BadRequestException("Network interface entry is invalid");
    }
    if (typeof networkInterface.name !== "string") {
      throw new BadRequestException("Network interface name is invalid");
    }
    const name = networkInterface.name.trim();
    if (!name || name.length > 255) {
      throw new BadRequestException("Network interface name is invalid");
    }
    const normalizedName = name.toLocaleLowerCase("en-US");
    if (names.has(normalizedName)) {
      throw new BadRequestException("Network snapshot contains duplicate interfaces");
    }
    names.add(normalizedName);
    if (/^(?:lo|loopback(?:\b|[-\s]))/i.test(name)) {
      throw new BadRequestException("Loopback interfaces are not eligible");
    }
    if (!Object.values(NetworkInterfaceType).includes(networkInterface.interfaceType)) {
      throw new BadRequestException("Network interface type is invalid");
    }
    if (!Array.isArray(networkInterface.ipAddresses) || networkInterface.ipAddresses.length > 128) {
      throw new BadRequestException("Network interface address list is invalid");
    }

    const seenAddresses = new Map<string, number>();
    const ipAddresses: NormalizedNetworkAddress[] = [];
    for (const item of networkInterface.ipAddresses) {
      if (!item || typeof item !== "object") {
        throw new BadRequestException("Network interface address entry is invalid");
      }
      const normalized = normalizeAddress(item.address, item.prefixLength);
      const previousPrefix = seenAddresses.get(normalized.address);
      if (previousPrefix !== undefined) {
        if (previousPrefix !== normalized.prefixLength) {
          throw new BadRequestException(
            "A network address cannot have conflicting prefix lengths on one interface",
          );
        }
        continue;
      }
      seenAddresses.set(normalized.address, normalized.prefixLength);
      ipAddresses.push(normalized);
    }

    return {
      name,
      interfaceType: networkInterface.interfaceType,
      macAddress: normalizeMacAddress(networkInterface.macAddress),
      ipAddresses,
    };
  });
}

export async function replaceNetworkSnapshot(
  tx: Prisma.TransactionClient,
  deviceId: string,
  snapshot: NormalizedNetworkInterface[] | undefined,
) {
  if (snapshot === undefined) return;

  await tx.networkInterface.deleteMany({ where: { deviceId } });
  for (const item of snapshot) {
    await tx.networkInterface.create({
      data: {
        deviceId,
        name: item.name,
        interfaceType: item.interfaceType,
        macAddress: item.macAddress,
        ipAddresses: {
          create: item.ipAddresses,
        },
      },
    });
  }
}

function normalizeMacAddress(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new BadRequestException("Network interface MAC address is invalid");
  }
  const compact = value.replace(/[:-]/g, "");
  if (!/^[0-9a-fA-F]{12}$/.test(compact)) {
    throw new BadRequestException("Network interface MAC address is invalid");
  }

  const octets = compact.match(/.{2}/g);
  if (!octets) throw new BadRequestException("Network interface MAC address is invalid");
  const bytes = octets.map((octet) => Number.parseInt(octet, 16));
  if (
    bytes.every((byte) => byte === 0) ||
    bytes.every((byte) => byte === 255) ||
    (bytes[0] & 1) === 1
  ) {
    throw new BadRequestException("Network interface MAC address is unusable");
  }
  return octets.join(":").toUpperCase();
}

function normalizeAddress(
  address: string,
  prefixLength: number,
): NormalizedNetworkAddress {
  if (typeof address !== "string" || address.includes("%")) {
    throw new BadRequestException("Network IP address is invalid");
  }
  const family = isIP(address);
  if (!family) throw new BadRequestException("Network IP address is invalid");

  const maximumPrefix = family === 4 ? 32 : 128;
  if (
    !Number.isInteger(prefixLength) ||
    prefixLength < 0 ||
    prefixLength > maximumPrefix
  ) {
    throw new BadRequestException("Network IP prefix length is invalid");
  }

  let normalizedAddress: string;
  if (family === 4) {
    normalizedAddress = address
      .split(".")
      .map((octet) => String(Number.parseInt(octet, 10)))
      .join(".");
  } else {
    try {
      normalizedAddress = new URL(`http://[${address}]/`).hostname
        .slice(1, -1)
        .toLowerCase();
    } catch {
      throw new BadRequestException("Network IP address is invalid");
    }
    if (normalizedAddress.startsWith("::ffff:")) {
      throw new BadRequestException("IPv4-mapped IPv6 addresses are not supported");
    }
  }

  const scope =
    family === 4
      ? classifyIpv4(normalizedAddress)
      : classifyIpv6(normalizedAddress);
  return {
    address: normalizedAddress,
    family: family === 4 ? NetworkAddressFamily.IPV4 : NetworkAddressFamily.IPV6,
    prefixLength,
    scope,
  };
}

function classifyIpv4(address: string): NetworkAddressScope {
  const octets = address.split(".").map((octet) => Number.parseInt(octet, 10));
  const [first, second, third] = octets;
  if (
    first === 0 ||
    first === 127 ||
    (first >= 224 && first <= 239) ||
    (first === 255 && second === 255 && third === 255)
  ) {
    throw new BadRequestException("Unspecified, loopback, or multicast IP is not eligible");
  }
  if (first === 169 && second === 254) return NetworkAddressScope.APIPA;
  if (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  ) {
    return NetworkAddressScope.PRIVATE;
  }
  if (first === 100 && second >= 64 && second <= 127) {
    return NetworkAddressScope.SHARED;
  }
  if (
    (first === 192 && second === 0 && third === 2) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113)
  ) {
    return NetworkAddressScope.DOCUMENTATION;
  }
  if (
    (first === 192 && second === 0 && third === 0) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 240
  ) {
    return NetworkAddressScope.RESERVED;
  }
  return NetworkAddressScope.PUBLIC;
}

function classifyIpv6(address: string): NetworkAddressScope {
  const words = expandIpv6(address);
  const allZero = words.every((word) => word === 0);
  if (allZero || (words.slice(0, 7).every((word) => word === 0) && words[7] === 1)) {
    throw new BadRequestException("Unspecified or loopback IP is not eligible");
  }
  if ((words[0] & 0xff00) === 0xff00) {
    throw new BadRequestException("Multicast IP addresses are not eligible");
  }
  if ((words[0] & 0xffc0) === 0xfe80) return NetworkAddressScope.LINK_LOCAL;
  if ((words[0] & 0xfe00) === 0xfc00) return NetworkAddressScope.UNIQUE_LOCAL;
  if (
    words[0] === 0x2001 &&
    words[1] === 0x0db8
  ) {
    return NetworkAddressScope.DOCUMENTATION;
  }
  if ((words[0] & 0xffc0) === 0xfec0) return NetworkAddressScope.RESERVED;
  return NetworkAddressScope.PUBLIC;
}

function expandIpv6(address: string): number[] {
  const halves = address.toLowerCase().split("::");
  const parseHalf = (half: string) =>
    half ? half.split(":").map((part) => Number.parseInt(part, 16)) : [];
  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] ?? "");
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) {
    throw new BadRequestException("Network IPv6 address is invalid");
  }
  return [...left, ...Array(missing).fill(0), ...right];
}
