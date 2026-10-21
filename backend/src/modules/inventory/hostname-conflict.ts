import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export function assertComputerNameHasNoControlCharacters(computerName: string) {
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(computerName)) {
    throw new BadRequestException("Computer name contains unsupported control characters");
  }
}

export async function lockHostname(
  tx: Prisma.TransactionClient,
  computerName: string,
) {
  await tx.$queryRaw`
    SELECT 1 AS "locked"
    FROM (
      SELECT pg_advisory_xact_lock(hashtext(lower(${computerName})))
    ) AS "hostname_lock"
  `;
}

export async function assertHostnameAvailable(
  tx: Prisma.TransactionClient,
  computerName: string,
  excludeDeviceId?: string,
) {
  const conflict = await tx.device.findFirst({
    where: {
      computerName: { equals: computerName, mode: "insensitive" },
      ...(excludeDeviceId ? { id: { not: excludeDeviceId } } : {}),
    },
    select: { id: true },
  });
  if (conflict) {
    throw new ConflictException("Hostname conflicts with another device");
  }
}
