import type { Metadata } from "next";
import Link from "next/link";
import { RequireSession } from "@/components/auth/require-session";
import { NewSignatureRequest } from "@/components/signatures/new-signature-request";
import { requestText as t } from "@/lib/i18n/signature-requests";

export const metadata: Metadata = { title: t.create };

export default async function NewRequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <RequireSession>
      <main id="main-content" className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
        <Link
          href={`/orgs/${encodeURIComponent(slug)}`}
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          {t.back}
        </Link>
        <h1 className="mt-6 mb-8 text-3xl font-semibold tracking-tight text-primary">{t.create}</h1>
        <NewSignatureRequest key={slug} slug={slug} />
      </main>
    </RequireSession>
  );
}
