import { Transform } from "class-transformer";
import { IsEnum, IsString, IsUUID, Length, Matches } from "class-validator";
import { Category } from "../../generated/prisma/client.js";

export class CreateSignatureRequestDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsEnum(Category)
  category!: Category;

  @Matches(/^[0-9a-f]{64}$/)
  fileHash!: string;

  @IsUUID("7")
  signerId!: string;
}
