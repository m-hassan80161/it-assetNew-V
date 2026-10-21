import {
  AgentGrantPurpose,
  AgentRegistrationStatus,
} from "@prisma/client";
import {
  BadRequestException,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import { InventoryPayloadDto } from "../inventory/dto/inventory-payload.dto";
import { AgentAuthGuard } from "./agent-auth.guard";
import { AgentsService } from "./agents.service";

const actor = { id: "admin-test", username: "test-admin" };

function createService(transaction: Record<string, any>) {
  const prisma = {
    $transaction: jest.fn(
      (callback: (tx: Record<string, any>) => unknown) => callback(transaction),
    ),
    managedAgent: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  } as unknown as PrismaService;
  const inventory = {
    ingestForManagedAgent: jest.fn(),
  } as unknown as InventoryService;
  return new AgentsService(prisma, inventory);
}

describe("AgentsService", () => {
  it("issues a short-lived single-use grant and stores only its verifier", async () => {
    const tx = {
      agentEnrollmentGrant: { create: jest.fn().mockResolvedValue({ id: "grant-1", purpose: AgentGrantPurpose.ENROLLMENT }) },
      agentAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = createService(tx);

    const result = await service.issueEnrollmentGrant(actor, {
      allowDeviceCreate: true,
    });

    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const storedHash = tx.agentEnrollmentGrant.create.mock.calls[0][0].data.tokenHash;
    expect(storedHash).toHaveLength(64);
    expect(storedHash).not.toBe(result.token);
    expect(tx.agentAuditEvent.create.mock.calls[0][0].data.details).not.toHaveProperty("token");
  });

  it("enrolls only against the grant-bound existing device and never stores the raw credential", async () => {
    const token = "A".repeat(43);
    const tx = {
      agentEnrollmentGrant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "grant-2",
          tokenHash: "unused",
          purpose: AgentGrantPurpose.ENROLLMENT,
          deviceId: "existing-device-id",
          allowDeviceCreate: false,
          consumedAt: null,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      device: {
        findUnique: jest.fn().mockResolvedValue({ id: "existing-device-id" }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn(),
      },
      managedAgent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "agent-1" }),
      },
      agentAuditEvent: { create: jest.fn().mockResolvedValue({}) },
      $queryRaw: jest.fn().mockResolvedValue([{ id: "existing-device-id" }]),
    };
    const service = createService(tx);

    const result = await service.enroll({
      enrollmentToken: token,
      computerName: "host-new-name",
    });

    expect(result.deviceId).toBe("existing-device-id");
    expect(result.agentId).toBe("agent-1");
    expect(result.credential).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tx.device.create).not.toHaveBeenCalled();
    expect(tx.agentEnrollmentGrant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "grant-2", consumedAt: null }),
      }),
    );
    const storedHash = tx.managedAgent.create.mock.calls[0][0].data.credentialHash;
    expect(storedHash).toHaveLength(64);
    expect(storedHash).not.toBe(result.credential);
  });

  it("rejects expired or replayed enrollment grants before creating registrations", async () => {
    const tx = {
      agentEnrollmentGrant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "expired-grant",
          purpose: AgentGrantPurpose.ENROLLMENT,
          deviceId: null,
          allowDeviceCreate: true,
          consumedAt: new Date(),
          revokedAt: null,
          expiresAt: new Date(Date.now() - 60_000),
        }),
      },
      managedAgent: { create: jest.fn() },
      agentAuditEvent: { create: jest.fn() },
      $queryRaw: jest.fn(),
    };
    const service = createService(tx);

    await expect(
      service.enroll({
        enrollmentToken: "B".repeat(43),
        computerName: "host-1",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tx.managedAgent.create).not.toHaveBeenCalled();
  });

  it("rejects control characters in enrollment hostnames before database access", async () => {
    const service = createService({});

    await expect(
      service.enroll({
        enrollmentToken: "E".repeat(43),
        computerName: "host\nforged",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("issues a serialized server revision on authenticated check-in", async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "device-1" }]),
      managedAgent: {
        findFirst: jest.fn().mockResolvedValue({ id: "agent-1" }),
        update: jest.fn().mockResolvedValue({ inventoryRevision: 42n }),
      },
    };
    const service = createService(tx);

    await expect(
      service.checkIn(
        {
          id: "agent-1",
          deviceId: "device-1",
          credentialHash: "credential-hash",
          credentialKind: "active",
        },
        {},
      ),
    ).resolves.toMatchObject({ inventoryRevision: "42", status: "ok" });
    expect(tx.managedAgent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ inventoryRevision: { increment: 1n } }),
      }),
    );
  });

  it("requires a numeric server-issued revision for managed inventory", async () => {
    const inventory = {
      ingestForManagedAgent: jest.fn().mockResolvedValue({ status: "ok" }),
    } as unknown as InventoryService;
    const service = new AgentsService({} as PrismaService, inventory);
    const agent = {
      id: "agent-1",
      deviceId: "device-1",
      credentialHash: "credential-hash",
      credentialKind: "active" as const,
    };

    await expect(
      service.submitInventory(agent, {} as InventoryPayloadDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    await service.submitInventory(agent, {} as InventoryPayloadDto, "42");
    expect(inventory.ingestForManagedAgent).toHaveBeenCalledWith(
      "agent-1",
      "device-1",
      {},
      42n,
    );
  });

  it("keeps the active credential until a pending credential is confirmed", async () => {
    const tx = {
      managedAgent: {
        findUnique: jest.fn().mockResolvedValue({
          id: "agent-1",
          deviceId: "device-1",
          status: AgentRegistrationStatus.ENABLED,
          pendingCredentialExpiresAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      agentEnrollmentGrant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "rotation-grant",
          purpose: AgentGrantPurpose.ROTATION,
          deviceId: "device-1",
          consumedAt: null,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      agentAuditEvent: { create: jest.fn().mockResolvedValue({}) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const service = createService(tx);
    const rotated = await service.rotateCredential(
      {
        id: "agent-1",
        deviceId: "device-1",
        credentialHash: "active-hash",
        credentialKind: "active",
      },
      "C".repeat(43),
    );

    expect(rotated.credential).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const rotationUpdate = tx.managedAgent.update.mock.calls[0][0].data;
    expect(rotationUpdate.pendingCredentialHash).toHaveLength(64);
    expect(rotationUpdate.pendingCredentialHash).not.toBe(rotated.credential);
    expect(rotationUpdate).not.toHaveProperty("credentialHash");
  });

  it("revokes both active and pending credential verifiers", async () => {
    const tx = {
      managedAgent: {
        findUnique: jest.fn().mockResolvedValue({
          id: "agent-1",
          deviceId: "device-1",
          status: AgentRegistrationStatus.ENABLED,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      agentAuditEvent: { create: jest.fn().mockResolvedValue({}) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const service = createService(tx);

    await service.revokeAgent(actor, "agent-1");

    expect(tx.managedAgent.update.mock.calls[0][0].data).toEqual({
      status: AgentRegistrationStatus.REVOKED,
      credentialHash: null,
      pendingCredentialHash: null,
      pendingCredentialExpiresAt: null,
    });
  });
});

describe("AgentAuthGuard", () => {
  it("maps a bearer credential to its server-side device registration", async () => {
    const token = "D".repeat(43);
    const credentialHash = createHash("sha256").update(token).digest("hex");
    const request = {
      get: jest.fn().mockReturnValue(`Bearer ${token}`),
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const prisma = {
      managedAgent: {
        findFirst: jest.fn().mockResolvedValue({
          id: "agent-9",
          deviceId: "device-9",
          credentialHash,
          pendingCredentialHash: null,
        }),
      },
    } as unknown as PrismaService;
    const guard = new AgentAuthGuard(prisma);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request).toHaveProperty("agent", {
      id: "agent-9",
      deviceId: "device-9",
      credentialHash,
      credentialKind: "active",
    });
    expect(prisma.managedAgent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: AgentRegistrationStatus.ENABLED,
          deviceId: { not: null },
        }),
      }),
    );
  });

  it("rejects invalid or revoked credentials", async () => {
    const request = { get: jest.fn().mockReturnValue("Bearer invalid") };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const prisma = {
      managedAgent: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const guard = new AgentAuthGuard(prisma);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.managedAgent.findFirst).not.toHaveBeenCalled();
  });
});
