import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class IssueEnrollmentGrantDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceId?: string;

  @IsOptional()
  @IsBoolean()
  allowDeviceCreate?: boolean;
}
