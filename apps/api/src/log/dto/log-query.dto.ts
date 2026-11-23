import { applyDecorators } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

// Prisma Int is a signed 32-bit integer. Express can supply arrays for repeated fields.
function LogInteger(min: number): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === "string" && value.length > 0 && !/[^0-9]/.test(value) ? Number(value) : NaN,
    ),
    IsInt(),
    Min(min),
    Max(2_147_483_647),
  );
}

export class HistoryQueryDto {
  @IsOptional()
  @LogInteger(1)
  before?: number;
}

export class EntriesQueryDto {
  @IsOptional()
  @LogInteger(0)
  start?: number;

  @IsOptional()
  @LogInteger(0)
  end?: number;
}

export class InclusionQueryDto {
  @LogInteger(0)
  leafIndex!: number;

  @LogInteger(1)
  treeSize!: number;
}

export class ConsistencyQueryDto {
  @LogInteger(1)
  first!: number;

  @LogInteger(1)
  second!: number;
}
