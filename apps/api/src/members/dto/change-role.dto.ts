import { IsIn } from "class-validator";
import type { Role } from "../../generated/prisma/client.js";

export class ChangeRoleDto {
  @IsIn(["owner", "signer", "issuer"])
  role!: Role;
}
