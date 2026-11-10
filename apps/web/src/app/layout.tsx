import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/site-header";
import { ko } from "@/lib/i18n/ko";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: ko.brand, template: `%s · ${ko.brand}` },
  description: ko.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <a
          href="#main-content"
          className="sr-only fixed left-4 top-3 z-50 rounded bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only"
        >
          {ko.common.skipToContent}
        </a>
        <Providers>
          <SiteHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
