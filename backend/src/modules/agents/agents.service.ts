import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  AgentGrantPurpose,
  AgentRegistrationStatus,
  Prisma,
} from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import { InventoryPayloadDto } from "../inventory/dto/inventory-payload.dto";
import {
  assertComputerNameHasNoControlCharacters,
  assertHostnameAvailable,
  lockHostname,
} from "../inventory/hostname-conflict";
import { AgentCheckInDto } from "./dto/agent-check-in.dto";
import { EnrollAgentDto } from "./dto/enroll-agent.dto";
import { IssueEnrollmentGrantDto } from "./dto/issue-enrollment-grant.dto";
import { AuthenticatedAgent } from "./agent-auth.guard";

const ENROLLMENT_GRANT_TTL_MS = 15 * 60 * 1000;
const PENDING_CREDENTIAL_TTL_MS = 10 * 60 * 1000;

export interface AgentAdminActor {
  id: string;
  username: string;
}

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async submitInventory(
    agent: AuthenticatedAgent,
    payload: InventoryPayloadDto,
    revision?: string,
  ) {
    if (
      !revision ||
      revision.length > 19 ||
      !/^[1-9]\d*$/.test(revision)
    ) {
      throw new BadRequestException(
        "A valid server-issued inventory revision is required",
      );
    }

    const snapshotRevision = BigInt(revision);
    if (snapshotRevision > 9_223_372_036_854_775_807n) {
      throw new BadRequestException("Inventory revision is out of range");
    }

    return this.inventory.ingestForManagedAgent(
      agent.id,
      agent.deviceId,
      payload,
      snapshotRevision,
    );
  }

  async issueEnrollmentGrant(
    actor: AgentAdminActor,
    dto: IssueEnrollmentGrantDto,
  ) {
    const deviceId = dto.deviceId?.trim() || null;
    const allowDeviceCreate = dto.allowDeviceCreate === true;
    if (Boolean(deviceId) === allowDeviceCreate) {
      throw new BadRequestException(
        "Bind the grant to one existing device or explicitly authorize new-device creation",
      );
    }

    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + ENROLLMENT_GRANT_TTL_MS);
    const grant = await this.prisma.$transaction(async (tx) => {
      if (deviceId) {
        const device = await tx.device.findUnique({
          where: { id: deviceId },
          select: { id: true },
        });
        if (!device) throw new NotFoundException("Device not found");
        const registration = await tx.managedAgent.findUnique({
          where: { deviceId },
          select: { id: true },
        });
        if (registration) {
          throw new ConflictException(
            "A managed registration already exists for this device; use the authorized recovery process",
          );
        }
      }

      const created = await tx.agentEnrollmentGrant.create({
        data: {
          tokenHash: this.hashToken(token),
          purpose: AgentGrantPurpose.ENROLLMENT,
          deviceId,
          allowDeviceCreate,
          createdByAdminId: actor.id,
          expiresAt,
        },
      });
      await this.writeAudit(tx, {
        actor,
        deviceId,
        eventType: "ENROLLMENT_GRANT_ISSUED",
        outcome: "SUCCEEDED",
        details: {
          grantId: created.id,
          expiresAt: expiresAt.toISOString(),
          allowDeviceCreate,
        },
      });
      return created;
    });

    return {
      id: grant.id,
      purpose: grant.purpose,
      token,
      expiresAt,
    };
  }

  async issueAgentGrant(
    actor: AgentAdminActor,
    agentId: string,
    purpose: AgentGrantPurpose,
  ) {
    if (
      purpose !== AgentGrantPurpose.RECOVERY &&
      purpose !== AgentGrantPurpose.ROTATION
    ) {
      throw new BadRequestException("Unsupported agent grant purpose");
    }
    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + ENROLLMENT_GRANT_TTL_MS);
    const grant = await this.prisma.$transaction(async (tx) => {
      const initialAgent = await tx.managedAgent.findUnique({
        where: { id: agentId },
        select: { id: true, deviceId: true },
      });
      if (!initialAgent?.deviceId) {
        throw new NotFoundException("Managed agent not found");
      }

      await tx.$queryRaw`SELECT "id" FROM "Device" WHERE "id" = ${initialAgent.deviceId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "ManagedAgent" WHERE "id" = ${agentId} FOR UPDATE`;
      const agent = await tx.managedAgent.findUnique({
        where: { id: agentId },
        select: { id: true, deviceId: true, status: true },
      });
      if (!agent?.deviceId) throw new NotFoundException("Managed agent not found");
      if (
        purpose === AgentGrantPurpose.RECOVERY &&
        agent.status !== AgentRegistrationStatus.REVOKED
      ) {
        throw new ConflictException(
          "Revoke the existing credential before authorizing agent recovery",
        );
      }
      if (
        purpose === AgentGrantPurpose.ROTATION &&
        agent.status !== AgentRegistrationStatus.ENABLED
      ) {
        throw new ConflictException("Only an enabled agent can rotate its credential");
      }

      const existingGrant = await tx.agentEnrollmentGrant.findFirst({
        where: {
          deviceId: agent.deviceId,
          purpose,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (existingGrant) {
        throw new ConflictException(
          "An unexpired authorization grant already exists for this operation",
        );
      }

      const created = await tx.agentEnrollmentGrant.create({
        data: {
          tokenHash: this.hashToken(token),
          purpose,
          deviceId: agent.deviceId,
          createdByAdminId: actor.id,
          expiresAt,
        },
      });
      await this.writeAudit(tx, {
        actor,
        agentId: agent.id,
        deviceId: agent.deviceId,
        eventType: `${purpose}_GRANT_ISSUED`,
        outcome: "SUCCEEDED",
        details: {
          grantId: created.id,
          expiresAt: expiresAt.toISOString(),
        },
      });
      return created;
    });

    return {
      id: grant.id,
      purpose: grant.purpose,
      token,
      expiresAt,
    };
  }

  async enroll(dto: EnrollAgentDto) {
    const tokenHash = this.hashToken(dto.enrollmentToken);
    const credential = this.generateToken();
    const credentialHash = this.hashToken(credential);
    assertComputerNameHasNoControlCharacters(dto.computerName);
    const computerName = dto.computerName.trim();
    if (!computerName) throw new BadRequestException("Hostname is required");
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const grant = await tx.agentEnrollmentGrant.findUnique({
        where: { tokenHash },
      });
      if (
        !grant ||
        grant.consumedAt ||
        grant.revokedAt ||
        grant.expiresAt <= now
      ) {
        throw new UnauthorizedException("Enrollment authorization is invalid or expired");
      }
      if (
        grant.purpose !== AgentGrantPurpose.ENROLLMENT &&
        grant.purpose !== AgentGrantPurpose.RECOVERY
      ) {
        throw new UnauthorizedException("Grant is not valid for enrollment");
      }
      if (grant.purpose === AgentGrantPurpose.ENROLLMENT) {
        if (grant.deviceId && grant.allowDeviceCreate) {
          throw new UnauthorizedException("Enrollment grant is invalid");
        }
        if (!grant.deviceId && !grant.allowDeviceCreate) {
          throw new UnauthorizedException("Enrollment grant is not bound to a device");
        }
      } else if (!grant.deviceId || grant.allowDeviceCreate) {
        throw new UnauthorizedException("Recovery grant is not bound to a device");
      }

      if (grant.deviceId) {
        await tx.$queryRaw`SELECT "id" FROM "Device" WHERE "id" = ${grant.deviceId} FOR UPDATE`;
        const device = await tx.device.findUnique({
          where: { id: grant.deviceId },
          select: { id: true },
        });
        if (!device) throw new NotFoundException("Authorized device no longer exists");
      }

      await lockHostname(tx, computerName);
      await assertHostnameAvailable(tx, computerName, grant.deviceId ?? undefined);

      const claimed = await tx.agentEnrollmentGrant.updateMany({
        where: {
          id: grant.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (claimed.count !== 1) {
        throw new UnauthorizedException("Enrollment authorization has already been used");
      }

      let deviceId = grant.deviceId;
      if (!deviceId) {
        if (grant.purpose !== AgentGrantPurpose.ENROLLMENT || !grant.allowDeviceCreate) {
          throw new UnauthorizedException("Device creation was not authorized");
        }
        const device = await tx.device.create({
          data: {
            computerName,
            lastSeenAt: now,
          },
          select: { id: true },
        });
        deviceId = device.id;
      } else {
        await tx.device.update({
          where: { id: deviceId },
          data: { computerName, lastSeenAt: now },
        });
      }

      const existingAgent = await tx.managedAgent.findUnique({
        where: { deviceId },
        select: { id: true, status: true },
      });
      if (existingAgent) {
        if (
          grant.purpose !== AgentGrantPurpose.RECOVERY ||
          existingAgent.status !== AgentRegistrationStatus.REVOKED
        ) {
          throw new ConflictException(
            "This device already has a managed agent; no devices were merged",
          );
        }
        const agent = await tx.managedAgent.update({
          where: { id: existingAgent.id },
          data: {
            status: AgentRegistrationStatus.ENABLED,
            credentialHash,
            pendingCredentialHash: null,
            pendingCredentialExpiresAt: null,
            credentialVersion: { increment: 1 },
            agentVersion: dto.agentVersion,
            operatingSystem: dto.operatingSystem,
            lastSeenAt: now,
          },
          select: { id: true },
        });
        await this.writeAudit(tx, {
          agentId: agent.id,
          deviceId,
          eventType: "AGENT_RECOVERED",
          outcome: "SUCCEEDED",
          details: { grantId: grant.id },
        });
        return { agentId: agent.id, deviceId, recovered: true };
      }

      if (grant.purpose !== AgentGrantPurpose.ENROLLMENT) {
        throw new ConflictException("Recovery requires an existing revoked registration");
      }
      const agent = await tx.managedAgent.create({
        data: {
          deviceId,
          credentialHash,
          agentVersion: dto.agentVersion,
          operatingSystem: dto.operatingSystem,
          lastSeenAt: now,
        },
        select: { id: true },
      });
      await this.writeAudit(tx, {
        agentId: agent.id,
        deviceId,
        eventType: "AGENT_ENROLLED",
        outcome: "SUCCEEDED",
        details: { grantId: grant.id },
      });
      return { agentId: agent.id, deviceId, recovered: false };
    }).catch(async (error: unknown) => {
      if (error instanceof ConflictException) {
        await this.prisma.agentAuditEvent.create({
          data: {
            eventType: "ENROLLMENT_CONFLICT_REJECTED",
            outcome: "REJECTED",
            details: { operation: "enrollment" },
          },
        });
      }
      throw error;
    });

    return { ...result, credential };
  }

  async checkIn(agent: AuthenticatedAgent, dto: AgentCheckInDto) {
    const inventoryRevision = await this.prisma.$transaction(async (tx) => {
      const devices = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Device" WHERE "id" = ${agent.deviceId} FOR UPDATE
      `;
      if (!devices.length) {
        throw new UnauthorizedException("Agent registration is no longer enabled");
      }
      await tx.$queryRaw`SELECT "id" FROM "ManagedAgent" WHERE "id" = ${agent.id} FOR UPDATE`;
      const registration = await tx.managedAgent.findFirst({
        where: {
          id: agent.id,
          deviceId: agent.deviceId,
          status: AgentRegistrationStatus.ENABLED,
        },
        select: { id: true },
      });
      if (!registration) {
        throw new UnauthorizedException("Agent registration is no longer enabled");
      }
      const updated = await tx.managedAgent.update({
        where: { id: agent.id },
        data: {
          lastSeenAt: new Date(),
          agentVersion: dto.agentVersion,
          operatingSystem: dto.operatingSystem,
          inventoryRevision: { increment: 1n },
        },
        select: { inventoryRevision: true },
      });
      return updated.inventoryRevision;
    });
    return {
      status: "ok",
      serverTime: new Date().toISOString(),
      inventoryRevision: inventoryRevision.toString(),
    };
  }

  async rotateCredential(
    agent: AuthenticatedAgent,
    authorizationGrant: string,
  ) {
    if (agent.credentialKind !== "active") {
      throw new ForbiddenException("Credential rotation must start with the active credential");
    }
    const token = this.generateToken();
    const credentialHash = this.hashToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PENDING_CREDENTIAL_TTL_MS);
    const tokenHash = this.hashToken(authorizationGrant);

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Device" WHERE "id" = ${agent.deviceId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "ManagedAgent" WHERE "id" = ${agent.id} FOR UPDATE`;
      const registration = await tx.managedAgent.findUnique({
        where: { id: agent.id },
        select: {
          id: true,
          deviceId: true,
          status: true,
          pendingCredentialExpiresAt: true,
        },
      });
      const grant = await tx.agentEnrollmentGrant.findUnique({
        where: { tokenHash },
      });
      if (
        !registration ||
        registration.deviceId !== agent.deviceId ||
        registration.status !== AgentRegistrationStatus.ENABLED
      ) {
        throw new UnauthorizedException("Agent registration is no longer enabled");
      }
      if (
        !grant ||
        grant.purpose !== AgentGrantPurpose.ROTATION ||
        grant.deviceId !== agent.deviceId ||
        grant.consumedAt ||
        grant.revokedAt ||
        grant.expiresAt <= now
      ) {
        throw new UnauthorizedException("Credential rotation authorization is invalid");
      }
      if (
        registration.pendingCredentialExpiresAt &&
        registration.pendingCredentialExpiresAt > now
      ) {
        throw new ConflictException("A credential rotation is already pending");
      }

      const claimed = await tx.agentEnrollmentGrant.updateMany({
        where: {
          id: grant.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (claimed.count !== 1) {
        throw new UnauthorizedException("Credential rotation authorization has already been used");
      }

      await tx.managedAgent.update({
        where: { id: agent.id },
        data: {
          pendingCredentialHash: credentialHash,
          pendingCredentialExpiresAt: expiresAt,
        },
      });
      await this.writeAudit(tx, {
        agentId: agent.id,
        deviceId: agent.deviceId,
        eventType: "CREDENTIAL_ROTATION_STARTED",
        outcome: "SUCCEEDED",
        details: { authorizationGrantId: grant.id, expiresAt: expiresAt.toISOString() },
      });
    });

    return { credential: token, expiresAt };
  }

  async confirmCredential(agent: AuthenticatedAgent) {
    if (agent.credentialKind !== "pending") {
      throw new ForbiddenException("Confirmation requires the pending credential");
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Device" WHERE "id" = ${agent.deviceId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "ManagedAgent" WHERE "id" = ${agent.id} FOR UPDATE`;
      const registration = await tx.managedAgent.findUnique({
        where: { id: agent.id },
        select: {
          id: true,
          deviceId: true,
          status: true,
          pendingCredentialHash: true,
          pendingCredentialExpiresAt: true,
        },
      });
      if (
        !registration ||
        registration.deviceId !== agent.deviceId ||
        registration.status !== AgentRegistrationStatus.ENABLED ||
        registration.pendingCredentialHash !== agent.credentialHash ||
        !registration.pendingCredentialExpiresAt ||
        registration.pendingCredentialExpiresAt <= now
      ) {
        throw new UnauthorizedException("Pending credential is invalid or expired");
      }

      await tx.managedAgent.update({
        where: { id: agent.id },
        data: {
          credentialHash: agent.credentialHash,
          pendingCredentialHash: null,
          pendingCredentialExpiresAt: null,
          credentialVersion: { increment: 1 },
        },
      });
      await this.writeAudit(tx, {
        agentId: agent.id,
        deviceId: agent.deviceId,
        eventType: "CREDENTIAL_ROTATION_CONFIRMED",
        outcome: "SUCCEEDED",
      });
    });
    return { status: "confirmed" };
  }

  async listAgents(skip: number, take: number) {
    const [data, total] = await Promise.all([
      this.prisma.managedAgent.findMany({
        skip,
        take,
        orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          deviceId: true,
          status: true,
          credentialVersion: true,
          agentVersion: true,
          operatingSystem: true,
          lastSeenAt: true,
          lastInventoryAt: true,
          createdAt: true,
          updatedAt: true,
          device: {
            select: {
              id: true,
              computerName: true,
              osName: true,
              osVersion: true,
              lastSeenAt: true,
            },
          },
        },
      }),
      this.prisma.managedAgent.count(),
    ]);
    return { data, total, skip, take };
  }

  async revokeAgent(actor: AgentAdminActor, agentId: string) {
    return this.changeStatus(
      actor,
      agentId,
      AgentRegistrationStatus.REVOKED,
      "AGENT_REVOKED",
    );
  }

  async disableAgent(actor: AgentAdminActor, agentId: string) {
    return this.changeStatus(
      actor,
      agentId,
      AgentRegistrationStatus.DISABLED,
      "AGENT_DISABLED",
    );
  }

  async enableAgent(actor: AgentAdminActor, agentId: string) {
    return this.changeStatus(
      actor,
      agentId,
      AgentRegistrationStatus.ENABLED,
      "AGENT_ENABLED",
    );
  }

  private async changeStatus(
    actor: AgentAdminActor,
    agentId: string,
    status: AgentRegistrationStatus,
    eventType: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const initialAgent = await tx.managedAgent.findUnique({
        where: { id: agentId },
        select: { id: true, deviceId: true },
      });
      if (!initialAgent) throw new NotFoundException("Managed agent not found");
      if (initialAgent.deviceId) {
        await tx.$queryRaw`SELECT "id" FROM "Device" WHERE "id" = ${initialAgent.deviceId} FOR UPDATE`;
      }
      await tx.$queryRaw`SELECT "id" FROM "ManagedAgent" WHERE "id" = ${agentId} FOR UPDATE`;
      const agent = await tx.managedAgent.findUnique({
        where: { id: agentId },
        select: { id: true, deviceId: true, status: true },
      });
      if (!agent) throw new NotFoundException("Managed agent not found");
      if (agent.status === status) {
        throw new ConflictException("Agent is already in the requested state");
      }
      if (
        status === AgentRegistrationStatus.ENABLED &&
        agent.status === AgentRegistrationStatus.REVOKED
      ) {
        throw new ConflictException(
          "Revoked agents require the authorized recovery and re-enrollment process",
        );
      }
      if (status === AgentRegistrationStatus.ENABLED && !agent.deviceId) {
        throw new ConflictException("An agent without a device cannot be enabled");
      }

      const data: Prisma.ManagedAgentUpdateInput = { status };
      if (status === AgentRegistrationStatus.REVOKED) {
        data.credentialHash = null;
        data.pendingCredentialHash = null;
        data.pendingCredentialExpiresAt = null;
      }
      await tx.managedAgent.update({ where: { id: agentId }, data });
      await this.writeAudit(tx, {
        actor,
        agentId,
        deviceId: agent.deviceId,
        eventType,
        outcome: "SUCCEEDED",
      });
      return { id: agentId, status };
    });
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    event: {
      actor?: AgentAdminActor;
      agentId?: string;
      deviceId?: string | null;
      eventType: string;
      outcome: string;
      details?: Prisma.InputJsonObject;
    },
  ) {
    await tx.agentAuditEvent.create({
      data: {
        actorAdminId: event.actor?.id,
        actorUsername: event.actor?.username,
        agentId: event.agentId,
        deviceId: event.deviceId,
        eventType: event.eventType,
        outcome: event.outcome,
        details: event.details,
      },
    });
  }

  private generateToken() {
    return randomBytes(32).toString("base64url");
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }
}
