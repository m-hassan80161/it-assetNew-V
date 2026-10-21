import { IsString, Matches } from "class-validator";

export class RotateCredentialDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  authorizationGrant: string;
}
