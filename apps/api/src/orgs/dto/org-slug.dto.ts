import { IsString, Length, Matches } from "class-validator";

export const ORG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class OrgSlugDto {
  @IsString()
  @Length(1, 64)
  @Matches(ORG_SLUG_PATTERN)
  slug!: string;
}
