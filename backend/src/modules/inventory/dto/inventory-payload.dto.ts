import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
  ValidateIf,
} from "class-validator";
import { DeviceComponentDto } from "./device-component.dto";
import { NetworkInterfaceDto } from "./network-interface.dto";

export class CpuDto {
  @IsString() model: string;
  @IsNumber() cores: number;
  @IsNumber() threads: number;
  @IsNumber() clockSpeedMhz: number;
  @IsString() architecture: string;
}

export class MotherboardDto {
  @IsString() manufacturer: string;
  @IsString() model: string;
  @IsOptional() @IsString() serialNumber?: string | null;
}

export class RamModuleDto {
  @IsNumber() capacityGb: number;
  @IsNumber() speedMhz: number;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() slot?: string;
}

export class DiskDriveDto {
  @IsString() type: "SSD" | "HDD" | "NVME" | "UNKNOWN";
  @IsOptional() @IsString() serialNumber?: string;
  @IsNumber() totalSpaceGb: number;
  @IsNumber() freeSpaceGb: number;
}

export class InstalledSoftwareDto {
  @IsString() name: string;
  @IsString() version: string;
  @IsOptional() @IsString() publisher?: string;
  @IsOptional() @IsString() installDate?: string;
}

export class GitConfigDto {
  @IsOptional() @IsString() userName?: string;
  @IsOptional() @IsString() userEmail?: string;
  @IsOptional() @IsString() gitVersion?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) sshPublicKeys?: string[];
}

export class InventoryPayloadDto {
  @IsString()
  @Matches(/^[^\u0000-\u001f\u007f-\u009f]*$/u)
  computerName: string;
  @IsOptional() @IsString() loggedInUser?: string;
  @IsOptional() @IsString() osName?: string;
  @IsOptional() @IsString() osVersion?: string;
  @IsOptional() @IsString() osBuild?: string;
  @IsOptional() @IsString() domain?: string;

  @ValidateNested() @Type(() => CpuDto) cpu: CpuDto;
  @ValidateNested() @Type(() => MotherboardDto) motherboard: MotherboardDto;

  @IsArray() @ValidateNested({ each: true }) @Type(() => RamModuleDto)
  ramModules: RamModuleDto[];

  @IsArray() @ValidateNested({ each: true }) @Type(() => DiskDriveDto)
  disks: DiskDriveDto[];

  @IsArray() @ValidateNested({ each: true }) @Type(() => InstalledSoftwareDto)
  software: InstalledSoftwareDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeviceComponentDto)
  components?: DeviceComponentDto[];

  @IsOptional() @ValidateNested() @Type(() => GitConfigDto)
  gitConfig?: GitConfigDto;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => NetworkInterfaceDto)
  networkInterfaces?: NetworkInterfaceDto[];
}
