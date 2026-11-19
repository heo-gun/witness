import { IsUUID } from "class-validator";
import { OrgSlugDto } from "../../orgs/dto/org-slug.dto.js";

export class InvitationParamsDto {
  @IsUUID("7")
  id!: string;
}

export class OrgInvitationParamsDto extends OrgSlugDto {
  @IsUUID("7")
  id!: string;
}
