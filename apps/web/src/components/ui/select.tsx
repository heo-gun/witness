import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-12 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}
