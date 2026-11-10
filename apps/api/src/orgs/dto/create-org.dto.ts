import { Transform } from "class-transformer";
import { IsString, Length, Matches, MaxLength, ValidateIf } from "class-validator";
import { ORG_SLUG_PATTERN } from "./org-slug.dto.js";

export class CreateOrgDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Length(1, 64)
  @Matches(ORG_SLUG_PATTERN)
  slug!: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  description?: string;
}
