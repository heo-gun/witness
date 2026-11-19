import { Transform } from "class-transformer";
import { IsEmail, IsIn, MaxLength } from "class-validator";

export class InviteMemberDto {
  @IsIn(["signer", "issuer"])
  role!: "signer" | "issuer";

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
