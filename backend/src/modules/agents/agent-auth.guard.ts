import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { createHash } from "node:crypto";
import { AgentRegistrationStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

export interface AuthenticatedAgent {
  id: string;
  deviceId: string;
  credentialHash: string;
  credentialKind: "active" | "pending";
}

interface AgentRequest extends Request {
  agent?: AuthenticatedAgent;
}

@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AgentRequest>();
    const authorization = request.get("authorization");
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? "");
    if (!match) throw new UnauthorizedException("Agent authentication required");

    const credentialHash = createHash("sha256").update(match[1]).digest("hex");
    const now = new Date();
    const registration = await this.prisma.managedAgent.findFirst({
      where: {
        status: AgentRegistrationStatus.ENABLED,
        deviceId: { not: null },
        OR: [
          { credentialHash },
          {
            pendingCredentialHash: credentialHash,
            pendingCredentialExpiresAt: { gt: now },
          },
        ],
      },
      select: {
        id: true,
        deviceId: true,
        credentialHash: true,
        pendingCredentialHash: true,
      },
    });
    if (!registration?.deviceId) {
      throw new UnauthorizedException("Agent credential is invalid or revoked");
    }

    request.agent = {
      id: registration.id,
      deviceId: registration.deviceId,
      credentialHash,
      credentialKind:
        registration.credentialHash === credentialHash ? "active" : "pending",
    };
    return true;
  }
}
