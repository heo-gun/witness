import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      data-slot="card"
      className={cn("rounded-2xl border border-border bg-card p-6 shadow-xs sm:p-9", className)}
      {...props}
    />
  );
}
