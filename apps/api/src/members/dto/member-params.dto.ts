import { IsUUID } from "class-validator";
import { OrgSlugDto } from "../../orgs/dto/org-slug.dto.js";

export class MemberParamsDto extends OrgSlugDto {
  @IsUUID("7")
  userId!: string;
}
