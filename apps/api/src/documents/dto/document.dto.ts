import { IsInt, Matches, Max, Min } from "class-validator";
import { DocumentSignatureDto } from "../../signatures/dto/decision.dto.js";

export class VerifyHashDto {
  @Matches(/^[0-9a-f]{64}$/)
  hash!: string;
}

export class RevokeDocumentDto extends DocumentSignatureDto {
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  targetLeafIndex!: number;

  // JCS rejects unpaired surrogates and MySQL counts each Unicode code point.
  @Matches(/^\P{Surrogate}{1,500}$/u, {
    message: "reason must contain 1 to 500 Unicode characters",
  })
  @Matches(/\S/)
  reason!: string;
}
