import { IsUUID } from "class-validator";

export class InvitationParamsDto {
  @IsUUID("7")
  id!: string;
}
