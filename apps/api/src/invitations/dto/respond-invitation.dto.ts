import { Matches } from "class-validator";

export class RespondInvitationDto {
  @Matches(/^[0-9a-f]{64}$/)
  token!: string;
}
