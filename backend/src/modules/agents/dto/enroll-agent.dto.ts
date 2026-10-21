import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

export class EnrollAgentDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  enrollmentToken: string;

  @IsString()
  @MaxLength(255)
  @Matches(/^[^\u0000-\u001f\u007f-\u009f]*$/u)
  computerName: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  agentVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  operatingSystem?: string;
}
