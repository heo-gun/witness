"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { getDocument } from "@/api/documents";
import { Card } from "@/components/ui/card";
import { documentText as t } from "@/lib/i18n/documents";
import { useVerifiedDocuments } from "@/lib/use-verified-documents";
import { workspaceRetry } from "@/lib/workspace";
import { VerificationFailure, VerifiedDocument } from "./verified-document";
import { RevokeDocument } from "./revoke-document";

export function PublicDocumentDetail({ id }: { id: string }) {
  const lookup = useQuery({
    queryKey: ["documents", "detail", id],
    queryFn: ({ signal }) => getDocument(id, signal),
    networkMode: "always",
    retry: workspaceRetry,
  });
  const hash = lookup.data?.id === id ? lookup.data.fileHash : undefined;
  const verification = useVerifiedDocuments(hash);
  const record = verification.data?.documents.find((item) => item.issue.payload.documentId === id);
  const refreshing = lookup.isFetching || verification.isFetching;
  return (
    <main id="main-content" className="mx-auto max-w-3xl space-y-5 px-5 py-10 sm:px-8 sm:py-14">
      <Link className="text-sm text-muted-foreground underline underline-offset-4" href="/">
        {t.back}
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">{t.detail}</h1>
      {lookup.error instanceof ApiError && lookup.error.status === 404 ? (
        <Card>{t.missing}</Card>
      ) : lookup.isError || (lookup.isSuccess && !hash) ? (
        <VerificationFailure error={lookup.error} retry={() => void lookup.refetch()} />
      ) : lookup.isPending || verification.isPending ? (
        <Card role="status">{t.checking}</Card>
      ) : !verification.data || verification.error || !record ? (
        <VerificationFailure
          error={verification.error}
          retry={() => {
            void lookup.refetch();
            void verification.refetch();
          }}
        />
      ) : (
        <>
          {refreshing && <Card role="status">{t.checking}</Card>}
          <div className="space-y-5" hidden={refreshing} inert={refreshing}>
            <VerifiedDocument detail record={record} head={verification.data.head} />
            {!record.revocation && <RevokeDocument record={record} />}
          </div>
        </>
      )}
    </main>
  );
}
