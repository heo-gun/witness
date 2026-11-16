import { Transform } from "class-transformer";
import { IsEmail, MaxLength } from "class-validator";
import { ChangeRoleDto } from "../../members/dto/change-role.dto.js";

export class InviteMemberDto extends ChangeRoleDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
