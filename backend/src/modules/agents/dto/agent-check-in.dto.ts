import { IsOptional, IsString, MaxLength } from "class-validator";

export class AgentCheckInDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  agentVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  operatingSystem?: string;
}
