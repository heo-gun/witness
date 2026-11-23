import { Transform } from "class-transformer";
import { IsIn, IsString, IsUUID, Length, Matches } from "class-validator";
import type { KeyPurpose } from "@tlog/shared";

export class KeyIdDto {
  @IsUUID("7")
  id!: string;
}

export class RegisterKeyDto {
  @IsIn(["sign", "encrypt"])
  purpose!: KeyPurpose;

  @Matches(/^[0-9a-f]{64}$/)
  publicKey!: string;
}

export class RevokeKeyDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(1, 500)
  reason!: string;
}
