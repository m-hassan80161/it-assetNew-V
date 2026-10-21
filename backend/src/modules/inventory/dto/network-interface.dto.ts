import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { NetworkInterfaceType } from "@prisma/client";

export class NetworkAddressDto {
  @IsString()
  @MaxLength(45)
  address: string;

  @IsInt()
  @Min(0)
  @Max(128)
  prefixLength: number;
}

export class NetworkInterfaceDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsEnum(NetworkInterfaceType)
  interfaceType: NetworkInterfaceType;

  @IsOptional()
  @IsString()
  @MaxLength(17)
  macAddress?: string | null;

  @IsArray()
  @ArrayMaxSize(128)
  @ValidateNested({ each: true })
  @Type(() => NetworkAddressDto)
  ipAddresses: NetworkAddressDto[];
}
