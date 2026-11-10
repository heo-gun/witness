import type { ReactNode } from "react";
import { ko } from "@/lib/i18n/ko";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main
      id="main-content"
      className="mx-auto grid min-h-[calc(100svh-5rem)] max-w-6xl items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:gap-20 lg:py-20"
    >
      <div className="max-w-xl">
        <p className="mb-6 font-mono text-xs tracking-[0.2em] text-muted-foreground">
          {ko.auth.eyebrow}
        </p>
        <h2 className="whitespace-pre-line text-4xl font-semibold leading-[1.1] tracking-[-0.055em] text-primary sm:text-6xl">
          {ko.auth.headline}
        </h2>
        <div className="mt-7 border-l-2 border-primary/20 pl-4 text-sm leading-7 text-muted-foreground lg:mt-10">
          <p className="font-medium text-foreground">{ko.auth.introduction}</p>
          <p>{ko.auth.detail}</p>
        </div>
      </div>
      <div className="w-full max-w-md lg:justify-self-end">{children}</div>
    </main>
  );
}
