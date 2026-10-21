import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request, Response } from "express";
import { Public } from "../auth/public.decorator";
import {
  AgentAuthGuard,
  AuthenticatedAgent,
} from "./agent-auth.guard";
import { AgentsService } from "./agents.service";
import { AgentCheckInDto } from "./dto/agent-check-in.dto";
import { EnrollAgentDto } from "./dto/enroll-agent.dto";
import { RotateCredentialDto } from "./dto/rotate-credential.dto";
import { InventoryPayloadDto } from "../inventory/dto/inventory-payload.dto";

interface AgentRequest extends Request {
  agent?: AuthenticatedAgent;
}

@ApiTags("agent")
@Controller("agent")
export class AgentController {
  constructor(private readonly agents: AgentsService) {}

  @Public()
  @Post("enroll")
  enroll(
    @Body() dto: EnrollAgentDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.preventCaching(response);
    return this.agents.enroll(dto);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @ApiBearerAuth()
  @Post("check-in")
  checkIn(@Req() request: AgentRequest, @Body() dto: AgentCheckInDto) {
    return this.agents.checkIn(this.agent(request), dto);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @ApiBearerAuth()
  @Post("inventory")
  submitInventory(
    @Req() request: AgentRequest,
    @Body() payload: InventoryPayloadDto,
    @Headers("x-inventory-revision") revision: string | undefined,
  ) {
    return this.agents.submitInventory(this.agent(request), payload, revision);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @ApiBearerAuth()
  @Post("credentials/rotate")
  rotateCredential(
    @Req() request: AgentRequest,
    @Body() dto: RotateCredentialDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.preventCaching(response);
    return this.agents.rotateCredential(
      this.agent(request),
      dto.authorizationGrant,
    );
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @ApiBearerAuth()
  @Post("credentials/confirm")
  confirmCredential(@Req() request: AgentRequest) {
    return this.agents.confirmCredential(this.agent(request));
  }

  private agent(request: AgentRequest) {
    if (!request.agent) {
      throw new UnauthorizedException("Agent authentication required");
    }
    return request.agent;
  }

  private preventCaching(response: Response) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Pragma", "no-cache");
  }
}
