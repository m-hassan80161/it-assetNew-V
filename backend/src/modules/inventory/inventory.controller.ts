import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { InventoryService } from "./inventory.service";
import { DeviceComponentDto } from "./dto/device-component.dto";
import { InventoryPayloadDto } from "./dto/inventory-payload.dto";
import { Public } from "../auth/public.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AuthenticatedUser } from "../auth/authenticated-user";
import { BranchPatternDto } from "./dto/branch-pattern.dto";
import { CreateBranchDto } from "./dto/create-branch.dto";

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@ApiTags("inventory")
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // Called by the PowerShell GPO collector script (Invoke-RestMethod)
  @Public()
  @Post()
  ingest(@Body() payload: InventoryPayloadDto) {
    return this.inventoryService.ingest(payload);
  }

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query("skip") skip?: string,
    @Query("take") take?: string,
    @Query("softwareName") softwareName?: string,
    @Query("computerName") computerName?: string,
    @Query("branch") branch?: string,
  ) {
    return this.inventoryService.listDevices({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      softwareName,
      computerName,
      branch,
      role: request.user?.role,
      actorBranch: request.user?.branch,
    });
  }

  @Get("export")
  exportDevices(
    @Req() request: AuthenticatedRequest,
    @Query("branch") branch?: string,
  ) {
    if (!request.user) throw new BadRequestException("Authentication required");
    return this.inventoryService.exportDevices(branch, request.user.role, request.user.branch);
  }

  @Get("branch-patterns")
  @Roles(UserRole.SUPER_ADMIN)
  listBranchPatterns() {
    return this.inventoryService.listBranchPatterns();
  }

  @Get("branches")
  @Roles(UserRole.SUPER_ADMIN)
  listBranches() {
    return this.inventoryService.listBranches();
  }

  @Post("branches")
  @Roles(UserRole.SUPER_ADMIN)
  createBranch(@Body() dto: CreateBranchDto) {
    return this.inventoryService.createBranch(dto.name);
  }

  @Delete("branches/:name")
  @Roles(UserRole.SUPER_ADMIN)
  deleteBranch(@Param("name") name: string) {
    return this.inventoryService.deleteBranch(name);
  }

  @Post("branch-patterns")
  @Roles(UserRole.SUPER_ADMIN)
  createBranchPattern(
    @Req() request: AuthenticatedRequest,
    @Body() dto: BranchPatternDto,
  ) {
    if (!request.user) throw new BadRequestException("Authentication required");
    return this.inventoryService.createBranchPattern(request.user.id, dto);
  }

  @Delete("branch-patterns/:id")
  @Roles(UserRole.SUPER_ADMIN)
  deleteBranchPattern(@Param("id") id: string) {
    return this.inventoryService.deleteBranchPattern(id);
  }

  @Delete(":id")
  remove(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    if (!request.user) throw new UnauthorizedException("Authentication required");
    return this.inventoryService.deleteDevice(id, {
      id: request.user.id,
      username: request.user.username,
    });
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.inventoryService.getDeviceDetail(id);
  }

  @Post(":id/components")
  addComponent(
    @Param("id") id: string,
    @Body() dto: DeviceComponentDto,
  ) {
    return this.inventoryService.addDeviceComponent(id, dto);
  }

  @Put(":id/components/:componentId")
  updateComponent(
    @Param("id") id: string,
    @Param("componentId") componentId: string,
    @Body() dto: DeviceComponentDto,
  ) {
    return this.inventoryService.updateDeviceComponent(id, componentId, dto);
  }

  @Delete(":id/components/:componentId")
  removeComponent(
    @Param("id") id: string,
    @Param("componentId") componentId: string,
  ) {
    return this.inventoryService.removeDeviceComponent(id, componentId);
  }
}
