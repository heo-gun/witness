"use client";

import { useState } from "react";
import { personalKeys as text } from "@/lib/i18n/personal-keys";

export function KeyFingerprint({ value }: { value: string }) {
  const [result, setResult] = useState<"copied" | "manual">();
  return (
    <span className="inline-flex max-w-full flex-col items-start">
      <button
        type="button"
        title={value}
        aria-label={`${text.copy} · ${value}`}
        className="rounded py-1 font-mono text-sm underline decoration-border underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-ring"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setResult("copied");
          } catch {
            setResult("manual");
          }
        }}
      >
        {value.slice(0, 8)}…{value.slice(-8)}
      </button>
      <span role="status" className="text-xs text-muted-foreground">
        {result === "copied" && text.copied}
        {result === "manual" && (
          <>
            {text.manualCopy} <code className="select-all break-all">{value}</code>
          </>
        )}
      </span>
    </span>
  );
}
