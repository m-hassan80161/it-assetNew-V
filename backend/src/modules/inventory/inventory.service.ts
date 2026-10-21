import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  AgentRegistrationStatus,
  BranchPatternSource,
  Prisma,
  UserRole,
} from "@prisma/client";
import { createHash } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DeviceComponentDto } from "./dto/device-component.dto";
import { InventoryPayloadDto } from "./dto/inventory-payload.dto";
import { BranchPatternDto } from "./dto/branch-pattern.dto";
import {
  assertComputerNameHasNoControlCharacters,
  assertHostnameAvailable,
  lockHostname,
} from "./hostname-conflict";
import {
  normalizeNetworkInterfaces,
  replaceNetworkSnapshot,
} from "./network-inventory";

type ComponentSnapshot = Prisma.InputJsonObject;
type IngestedDevice = { id: string; computerName: string; duplicate?: boolean };

class StaleInventoryRevisionException extends ConflictException {}

function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value
      .map((item) => (item === undefined ? "null" : stableStringify(item)))
      .join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Full upsert of a device report coming from the PowerShell collector.
   * Runs as a single transaction so a partial failure never leaves the
   * device in a half-updated state.
   */
  async ingest(payload: InventoryPayloadDto) {
    return this.ingestForDevice(payload);
  }

  async ingestForManagedAgent(
    agentId: string,
    deviceId: string,
    payload: InventoryPayloadDto,
    snapshotRevision: bigint,
  ) {
    return this.ingestForDevice(payload, {
      agentId,
      deviceId,
      snapshotRevision,
    });
  }

  private async ingestForDevice(
    payload: InventoryPayloadDto,
    managedAgent?: {
      agentId: string;
      deviceId: string;
      snapshotRevision: bigint;
    },
  ) {
    assertComputerNameHasNoControlCharacters(payload.computerName);
    const networkSnapshot =
      payload.networkInterfaces === undefined
        ? undefined
        : normalizeNetworkInterfaces(payload.networkInterfaces);
    if (networkSnapshot !== undefined && !managedAgent) {
      throw new ForbiddenException(
        "Network inventory requires an authenticated managed agent",
      );
    }
    const snapshotHash = managedAgent
      ? createHash("sha256").update(stableStringify(payload)).digest("hex")
      : undefined;
    const device = await this.prisma.$transaction(async (tx): Promise<IngestedDevice> => {
      const dev: IngestedDevice = managedAgent
        ? await this.updateManagedDevice(
            tx,
            managedAgent,
            payload,
            snapshotHash!,
          )
        : await this.upsertLegacyDevice(tx, payload);
      if (dev.duplicate) return dev;
      const deviceId = dev.id;

      await tx.cpuInfo.upsert({
        where: { deviceId },
        create: { deviceId, ...payload.cpu },
        update: { ...payload.cpu },
      });

      await tx.motherboardInfo.upsert({
        where: { deviceId },
        create: { deviceId, ...payload.motherboard },
        update: { ...payload.motherboard },
      });

      // Replace-all strategy for collection children (simplest correctness
      // guarantee for a "current snapshot" model)
      await tx.ramModule.deleteMany({ where: { deviceId } });
      if (payload.ramModules?.length) {
        await tx.ramModule.createMany({
          data: payload.ramModules.map((r) => ({ deviceId, ...r })),
        });
      }

      await tx.diskDrive.deleteMany({ where: { deviceId } });
      if (payload.disks?.length) {
        await tx.diskDrive.createMany({
          data: payload.disks.map((d) => ({
            deviceId,
            type: d.type as any,
            serialNumber: d.serialNumber,
            totalSpaceGb: d.totalSpaceGb,
            freeSpaceGb: d.freeSpaceGb,
          })),
        });
      }

      if (payload.components !== undefined) {
        const manualComponents = await tx.deviceComponent.findMany({
          where: { deviceId, source: "MANUAL" },
          select: { category: true, name: true },
        });
        const manualComponentKeys = new Set(
          manualComponents.map(
            (component) =>
              `${component.category.toLowerCase()}\u0000${component.name.toLowerCase()}`,
          ),
        );

        await tx.deviceComponent.deleteMany({
          where: { deviceId, source: "INVENTORY" },
        });

        const discoveredComponents = payload.components.filter((component) => {
          const key = `${component.category.trim().toLowerCase()}\u0000${component.name.trim().toLowerCase()}`;
          return !manualComponentKeys.has(key);
        });
        if (discoveredComponents.length) {
          await tx.deviceComponent.createMany({
            data: discoveredComponents.map((component) => ({
              deviceId,
              ...this.normalizeComponent(component),
              source: "INVENTORY",
            })),
          });
        }
      }

      await tx.installedSoftware.deleteMany({ where: { deviceId } });
      if (payload.software?.length) {
        await tx.installedSoftware.createMany({
          data: payload.software.map((item) => ({
            deviceId,
            name: item.name,
            version: item.version,
            publisher: item.publisher,
            installDate: this.parseInstallDate(item.installDate),
          })),
        });
      }

      if (payload.gitConfig) {
        await tx.gitConfig.upsert({
          where: { deviceId },
          create: { deviceId, ...payload.gitConfig },
          update: { ...payload.gitConfig },
        });
      }

      await replaceNetworkSnapshot(tx, deviceId, networkSnapshot);

      if (managedAgent) {
        await tx.managedAgent.update({
          where: { id: managedAgent.agentId },
          data: {
            lastInventoryAt: new Date(),
            lastAppliedInventoryRevision: managedAgent.snapshotRevision,
            lastAppliedInventoryHash: snapshotHash,
          },
        });
      }

      return dev;
    }).catch(async (error: unknown) => {
      if (
        managedAgent &&
        error instanceof ConflictException &&
        !(error instanceof StaleInventoryRevisionException)
      ) {
        await this.prisma.agentAuditEvent.create({
          data: {
            agentId: managedAgent.agentId,
            deviceId: managedAgent.deviceId,
            eventType: "HOSTNAME_CONFLICT_REJECTED",
            outcome: "REJECTED",
            details: { source: "managed-inventory" },
          },
        });
      }
      throw error;
    });

    if (device.duplicate) {
      return { deviceId: device.id, status: "ok", duplicate: true };
    }
    this.logger.log(`Ingested inventory for ${device.computerName}`);
    return { deviceId: device.id, status: "ok" };
  }

  private async upsertLegacyDevice(
    tx: Prisma.TransactionClient,
    payload: InventoryPayloadDto,
  ) {
    return tx.device.upsert({
      where: { computerName: payload.computerName },
      create: {
        computerName: payload.computerName,
        loggedInUser: payload.loggedInUser,
        osName: payload.osName,
        osVersion: payload.osVersion,
        osBuild: payload.osBuild,
        domain: payload.domain,
      },
      update: {
        loggedInUser: payload.loggedInUser,
        osName: payload.osName,
        osVersion: payload.osVersion,
        osBuild: payload.osBuild,
        domain: payload.domain,
        lastSeenAt: new Date(),
      },
      select: { id: true, computerName: true },
    });
  }

  private async updateManagedDevice(
    tx: Prisma.TransactionClient,
    agent: {
      agentId: string;
      deviceId: string;
      snapshotRevision: bigint;
    },
    payload: InventoryPayloadDto,
    snapshotHash: string,
  ): Promise<IngestedDevice> {
    const lockedDevices = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Device" WHERE "id" = ${agent.deviceId} FOR UPDATE
    `;
    if (!lockedDevices.length) {
      throw new NotFoundException("Registered device no longer exists");
    }
    await tx.$queryRaw`SELECT "id" FROM "ManagedAgent" WHERE "id" = ${agent.agentId} FOR UPDATE`;
    const registeredAgent = await tx.managedAgent.findFirst({
      where: {
        id: agent.agentId,
        deviceId: agent.deviceId,
        status: AgentRegistrationStatus.ENABLED,
      },
      select: {
        id: true,
        inventoryRevision: true,
        lastAppliedInventoryRevision: true,
        lastAppliedInventoryHash: true,
      },
    });
    if (!registeredAgent) {
      throw new UnauthorizedException("Managed agent registration is not enabled");
    }
    if (agent.snapshotRevision > registeredAgent.inventoryRevision) {
      throw new BadRequestException("Inventory revision was not issued by the server");
    }
    if (agent.snapshotRevision < registeredAgent.inventoryRevision) {
      throw new StaleInventoryRevisionException(
        "Inventory snapshot was superseded by a newer server-issued revision",
      );
    }
    if (
      registeredAgent.lastAppliedInventoryRevision === agent.snapshotRevision
    ) {
      if (registeredAgent.lastAppliedInventoryHash === snapshotHash) {
        return {
          id: agent.deviceId,
          computerName: payload.computerName,
          duplicate: true,
        };
      }
      throw new StaleInventoryRevisionException(
        "Inventory revision was already applied with different content",
      );
    }
    if (
      registeredAgent.lastAppliedInventoryRevision !== null &&
      registeredAgent.lastAppliedInventoryRevision > agent.snapshotRevision
    ) {
      throw new StaleInventoryRevisionException(
        "Inventory snapshot is older than the last applied snapshot",
      );
    }

    await lockHostname(tx, payload.computerName);
    await assertHostnameAvailable(tx, payload.computerName, agent.deviceId);
    return tx.device.update({
      where: { id: agent.deviceId },
      data: {
        computerName: payload.computerName,
        loggedInUser: payload.loggedInUser,
        osName: payload.osName,
        osVersion: payload.osVersion,
        osBuild: payload.osBuild,
        domain: payload.domain,
        lastSeenAt: new Date(),
      },
      select: { id: true, computerName: true },
    });
  }

  private parseInstallDate(value?: string): Date | undefined {
    if (!value) return undefined;

    const compactDate = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
    const date = compactDate
      ? new Date(
          Date.UTC(
            Number(compactDate[1]),
            Number(compactDate[2]) - 1,
            Number(compactDate[3]),
          ),
        )
      : new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid software install date: ${value}`);
    }

    if (
      compactDate &&
      (date.getUTCFullYear() !== Number(compactDate[1]) ||
        date.getUTCMonth() !== Number(compactDate[2]) - 1 ||
        date.getUTCDate() !== Number(compactDate[3]))
    ) {
      throw new BadRequestException(`Invalid software install date: ${value}`);
    }

    return date;
  }

  async listDevices(
    params: {
      skip?: number;
      take?: number;
      softwareName?: string;
      computerName?: string;
      branch?: string;
      role?: UserRole;
      actorBranch?: string | null;
    } = {},
  ) {
    const softwareName = params.softwareName?.trim();
    const computerName = params.computerName?.trim();
    const branch = params.role === UserRole.ADMIN ? params.actorBranch : params.branch;
    if (params.role === UserRole.ADMIN && !branch) {
      throw new BadRequestException("Admin account has no assigned branch");
    }
    const rules = await this.prisma.branchPattern.findMany({
      orderBy: [{ pattern: "desc" }],
    });
    const filters: Prisma.DeviceWhereInput[] = [];
    if (computerName) {
      filters.push({ computerName: { contains: computerName, mode: "insensitive" } });
    }
    if (branch) {
      const branchRules = rules.filter((rule) => rule.branch === branch);
      const matchingRules: Prisma.DeviceWhereInput[] = [
        ...branchRules
          .filter((rule) => rule.source === BranchPatternSource.DOMAIN)
          .map((rule) => ({ domain: { contains: rule.pattern, mode: "insensitive" as const } })),
        ...branchRules
          .filter((rule) => rule.source === BranchPatternSource.COMPUTER_NAME)
          .map((rule) => ({
            AND: [
              { OR: [{ domain: null }, { domain: "" }] },
              { computerName: { contains: rule.pattern, mode: "insensitive" as const } },
            ],
          })),
      ];
      if (!matchingRules.length) return { data: [], total: 0 };
      filters.push({ OR: matchingRules });
    }
    const where = filters.length ? { AND: filters } : undefined;
    const include = {
      cpu: true,
      disks: true,
      software: softwareName
        ? { where: { name: { contains: softwareName, mode: "insensitive" as const } } }
        : true,
    } satisfies Prisma.DeviceInclude;
    const skip = params.skip ?? 0;
    const take = params.take ?? 50;

    if (branch) {
      const devices = await this.prisma.device.findMany({
        orderBy: { lastSeenAt: "desc" },
        where,
        include,
      });
      const matchedDevices = devices
        .map((device) => ({
          ...device,
          branch: this.resolveBranch(device, rules),
        }))
        .filter((device) => device.branch === branch);
      return {
        data: matchedDevices.slice(skip, skip + take),
        total: matchedDevices.length,
      };
    }

    const [devices, total] = await Promise.all([
      this.prisma.device.findMany({
        skip,
        take,
        orderBy: { lastSeenAt: "desc" },
        where,
        include,
      }),
      this.prisma.device.count({ where }),
    ]);
    return {
      data: devices.map((device) => ({
        ...device,
        branch: this.resolveBranch(device, rules),
      })),
      total,
    };
  }

  async exportDevices(branch: string | undefined, role: UserRole, actorBranch: string | null) {
    if (role === UserRole.ADMIN) {
      if (!actorBranch) throw new BadRequestException("Admin account has no assigned branch");
      if (branch && branch !== actorBranch) {
        throw new BadRequestException("Admins can only export devices from their assigned branch");
      }
      branch = actorBranch;
    }
    const rules = await this.prisma.branchPattern.findMany({
      orderBy: [{ pattern: "desc" }],
    });
    const include = {
      cpu: true,
      motherboard: true,
      ramModules: true,
      disks: true,
      components: {
        where: { category: { contains: "monitor", mode: "insensitive" } },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      },
    } satisfies Prisma.DeviceInclude;
    const devices: Prisma.DeviceGetPayload<{ include: typeof include }>[] = [];
    const batchSize = 1000;
    for (let skip = 0; ; skip += batchSize) {
      const batch = await this.prisma.device.findMany({
        skip,
        take: batchSize,
        orderBy: { computerName: "asc" },
        include,
      });
      devices.push(...batch);
      if (batch.length < batchSize) break;
    }
    return devices
      .map((device) => ({ ...device, branch: this.resolveBranch(device, rules) }))
      .filter((device) => !branch || device.branch === branch);
  }

  async listBranchPatterns() {
    return this.prisma.branchPattern.findMany({
      orderBy: [{ branch: "asc" }, { source: "asc" }, { pattern: "asc" }],
    });
  }

  async listBranches() {
    return this.prisma.branch.findMany({ orderBy: { name: "asc" } });
  }

  async createBranch(name: string) {
    const normalizedName = name.trim();
    if (!normalizedName) throw new BadRequestException("Branch name is required");
    return this.prisma.branch.create({ data: { name: normalizedName } });
  }

  async deleteBranch(name: string) {
    const branch = await this.prisma.branch.findUnique({ where: { name } });
    if (!branch) throw new NotFoundException("Branch not found");
    const [accounts, rules, tickets] = await Promise.all([
      this.prisma.adminAccount.count({
        where: {
          OR: [{ branch: name }, { managedBranches: { has: name } }],
        },
      }),
      this.prisma.branchPattern.count({ where: { branch: name } }),
      this.prisma.ticket.count({ where: { branch: name } }),
    ]);
    if (accounts || rules || tickets) {
      throw new BadRequestException("Branch is still in use by accounts, device rules, or tickets");
    }
    await this.prisma.branch.delete({ where: { name } });
    return { name, status: "deleted" };
  }

  async createBranchPattern(actorId: string, dto: BranchPatternDto) {
    const pattern = dto.pattern.trim();
    const branch = dto.branch.trim();
    if (!pattern || !branch) throw new BadRequestException("Pattern and branch are required");
    if (!(await this.prisma.branch.findUnique({ where: { name: branch } }))) {
      throw new BadRequestException("Select a branch from the configured branch list");
    }
    return this.prisma.branchPattern.create({
      data: { source: dto.source, pattern, branch, createdById: actorId },
    });
  }

  async deleteBranchPattern(id: string) {
    const result = await this.prisma.branchPattern.deleteMany({ where: { id } });
    if (!result.count) throw new NotFoundException("Branch pattern not found");
    return { id, status: "deleted" };
  }

  private resolveBranch(
    device: { domain: string | null; computerName: string },
    rules: Array<{ id: string; source: BranchPatternSource; pattern: string; branch: string }>,
  ) {
    const hasDomain = Boolean(device.domain?.trim());
    const source = hasDomain ? BranchPatternSource.DOMAIN : BranchPatternSource.COMPUTER_NAME;
    const value = (hasDomain ? device.domain : device.computerName)?.toLocaleLowerCase() ?? "";
    const match = rules
      .filter((rule) => rule.source === source && value.includes(rule.pattern.toLocaleLowerCase()))
      .sort((a, b) => b.pattern.length - a.pattern.length || a.id.localeCompare(b.id))[0];
    return match?.branch ?? null;
  }

  async deleteDevice(
    id: string,
    actor?: { id: string; username: string },
  ) {
    await this.prisma.$transaction(async (tx) => {
      const devices = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Device" WHERE "id" = ${id} FOR UPDATE
      `;
      if (!devices.length) throw new NotFoundException(`Device ${id} was not found`);

      await tx.$queryRaw`SELECT "id" FROM "ManagedAgent" WHERE "deviceId" = ${id} FOR UPDATE`;
      const managedAgent = await tx.managedAgent.findUnique({
        where: { deviceId: id },
        select: { id: true, status: true },
      });
      if (managedAgent?.status === AgentRegistrationStatus.ENABLED) {
        throw new ConflictException(
          "Disable or revoke the managed agent registration before deleting this device",
        );
      }
      if (managedAgent) {
        await tx.agentAuditEvent.create({
          data: {
            agentId: managedAgent.id,
            deviceId: id,
            actorAdminId: actor?.id,
            actorUsername: actor?.username,
            eventType: "DEVICE_DELETED",
            outcome: "SUCCEEDED",
            details: { registrationStatus: managedAgent.status },
          },
        });
      }
      await tx.device.delete({ where: { id } });
    });
    return { id, status: "deleted" };
  }

  async addDeviceComponent(deviceId: string, dto: DeviceComponentDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureDeviceExists(tx, deviceId);
      const data = this.normalizeComponent(dto);
      const component = await tx.deviceComponent.create({
        data: { deviceId, ...data },
      });

      await tx.deviceComponentHistory.create({
        data: {
          deviceId,
          componentId: component.id,
          componentName: this.componentName(data),
          action: "ADDED",
          newValue: this.componentSnapshot(data),
        },
      });

      return component;
    });
  }

  async updateDeviceComponent(
    deviceId: string,
    componentId: string,
    dto: DeviceComponentDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.deviceComponent.findFirst({
        where: { id: componentId, deviceId },
      });
      if (!current) {
        throw new NotFoundException(`Component ${componentId} was not found`);
      }

      const data = this.normalizeComponent(dto);
      const previousValue = this.componentSnapshot(current);
      const newValue = this.componentSnapshot(data);
      if (JSON.stringify(previousValue) === JSON.stringify(newValue)) {
        return current;
      }

      const component = await tx.deviceComponent.update({
        where: { id: componentId },
        data: { ...data, source: "MANUAL" },
      });
      await tx.deviceComponentHistory.create({
        data: {
          deviceId,
          componentId,
          componentName: this.componentName(data),
          action: "UPDATED",
          previousValue,
          newValue,
        },
      });

      return component;
    });
  }

  async removeDeviceComponent(deviceId: string, componentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const component = await tx.deviceComponent.findFirst({
        where: { id: componentId, deviceId },
      });
      if (!component) {
        throw new NotFoundException(`Component ${componentId} was not found`);
      }

      const previousValue = this.componentSnapshot(component);
      await tx.deviceComponentHistory.create({
        data: {
          deviceId,
          componentId,
          componentName: this.componentName(component),
          action: "REMOVED",
          previousValue,
        },
      });
      await tx.deviceComponent.delete({ where: { id: componentId } });

      return { id: componentId, status: "deleted" };
    });
  }

  private async ensureDeviceExists(
    tx: Prisma.TransactionClient,
    deviceId: string,
  ) {
    const device = await tx.device.findUnique({
      where: { id: deviceId },
      select: { id: true },
    });
    if (!device) {
      throw new NotFoundException(`Device ${deviceId} was not found`);
    }
  }

  private normalizeComponent(dto: DeviceComponentDto) {
    const category = dto.category.trim();
    const name = dto.name.trim();
    if (!category || !name) {
      throw new BadRequestException("Component category and name are required");
    }

    const specifications: Record<string, string> = {};
    const entries = Object.entries(dto.specifications ?? {});
    if (entries.length > 30) {
      throw new BadRequestException("A component can have at most 30 specifications");
    }
    for (const [rawKey, rawValue] of entries) {
      if (typeof rawKey !== "string" || typeof rawValue !== "string") {
        throw new BadRequestException("Component specifications must be text values");
      }
      const key = rawKey.trim();
      const value = rawValue.trim();
      if (!key || key.length > 80 || value.length > 500) {
        throw new BadRequestException("Component specification names or values are invalid");
      }
      if (value) specifications[key] = value;
    }

    return {
      category,
      name,
      manufacturer: dto.manufacturer?.trim() || null,
      model: dto.model?.trim() || null,
      sizeInches: dto.sizeInches != null && dto.sizeInches > 0
        ? dto.sizeInches
        : null,
      details: dto.details?.trim() || null,
      specifications,
    };
  }

  private componentSnapshot(value: {
    category: string;
    name: string;
    manufacturer?: string | null;
    model?: string | null;
    sizeInches?: number | null;
    details?: string | null;
    specifications?: Prisma.JsonValue;
  }): ComponentSnapshot {
    return {
      category: value.category,
      name: value.name,
      manufacturer: value.manufacturer ?? null,
      model: value.model ?? null,
      sizeInches: value.sizeInches ?? null,
      details: value.details ?? null,
      specifications: value.specifications ?? {},
    };
  }

  private componentName(value: { category: string; name: string }) {
    return `${value.category} / ${value.name}`;
  }

  async getDeviceDetail(id: string) {
    return this.prisma.device.findUnique({
      where: { id },
      include: {
        cpu: true,
        motherboard: true,
        ramModules: true,
        disks: true,
        software: true,
        gitConfig: true,
        components: { orderBy: [{ category: "asc" }, { name: "asc" }] },
        componentHistory: { orderBy: { changedAt: "desc" } },
      },
    });
  }
}
