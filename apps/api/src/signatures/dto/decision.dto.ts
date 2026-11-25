import { Transform } from "class-transformer";
import { IsISO8601, IsString, Length, Matches } from "class-validator";

export class DocumentSignatureDto {
  @Matches(/^[0-9a-f]{64}$/)
  signerKeyFingerprint!: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/)
  signedAt!: string;

  @Matches(/^[0-9a-f]{128}$/)
  signature!: string;
}

export class SignRequestDto extends DocumentSignatureDto {
  @Matches(/^[0-9a-f]{64}$/)
  fileHash!: string;
}

export class RejectRequestDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(1, 500)
  reason!: string;
}
