import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AgentGrantPurpose, UserRole } from "@prisma/client";
import { Request, Response } from "express";
import { AuthenticatedUser } from "../auth/authenticated-user";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AgentListQueryDto } from "./dto/agent-list-query.dto";
import { IssueEnrollmentGrantDto } from "./dto/issue-enrollment-grant.dto";
import { AgentsService } from "./agents.service";

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@ApiTags("agents")
@UseGuards(RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller("agents")
export class AgentAdminController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  list(@Query() query: AgentListQueryDto) {
    return this.agents.listAgents(query.skip, query.take);
  }

  @Post("enrollment-grants")
  issueEnrollmentGrant(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: IssueEnrollmentGrantDto,
  ) {
    this.preventCaching(response);
    return this.agents.issueEnrollmentGrant(this.actor(request), dto);
  }

  @Post(":id/recovery-grants")
  issueRecoveryGrant(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Param("id") id: string,
  ) {
    this.preventCaching(response);
    return this.agents.issueAgentGrant(
      this.actor(request),
      id,
      AgentGrantPurpose.RECOVERY,
    );
  }

  @Post(":id/rotation-grants")
  issueRotationGrant(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Param("id") id: string,
  ) {
    this.preventCaching(response);
    return this.agents.issueAgentGrant(
      this.actor(request),
      id,
      AgentGrantPurpose.ROTATION,
    );
  }

  @Post(":id/disable")
  disable(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.agents.disableAgent(this.actor(request), id);
  }

  @Post(":id/enable")
  enable(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.agents.enableAgent(this.actor(request), id);
  }

  @Post(":id/revoke")
  revoke(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.agents.revokeAgent(this.actor(request), id);
  }

  private actor(request: AuthenticatedRequest) {
    if (!request.user) throw new UnauthorizedException("Authentication required");
    return { id: request.user.id, username: request.user.username };
  }

  private preventCaching(response: Response) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Pragma", "no-cache");
  }
}
