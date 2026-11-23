import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsString, Length, Matches, MaxLength, ValidateIf } from "class-validator";
import type { EmailTokenPurpose } from "../../generated/prisma/client.js";

export class RequestEmailTokenDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn(["verify_email", "reset_password"])
  purpose!: EmailTokenPurpose;
}

export class ConsumeEmailTokenDto {
  @Matches(/^[0-9a-f]{64}$/)
  token!: string;

  @IsIn(["verify_email", "reset_password"])
  purpose!: EmailTokenPurpose;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(1, 50)
  name?: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @Length(8, 128)
  currentPassword!: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}
