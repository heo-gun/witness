"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listDocuments } from "@/api/documents";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { documentText as t } from "@/lib/i18n/documents";
import { ko } from "@/lib/i18n/ko";
import { requestText } from "@/lib/i18n/signature-requests";
import { workspaceErrorMessage, workspaceRetry } from "@/lib/workspace";

export function OrgDocuments({ slug }: { slug: string }) {
  const list = useQuery({
    queryKey: ["documents", "org", slug],
    queryFn: ({ signal }) => listDocuments(slug, signal),
    retry: workspaceRetry,
  });
  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold">{t.documents}</h2>
      {list.isError ? (
        <div role="alert" className="space-y-3">
          <p>{workspaceErrorMessage(list.error)}</p>
          <Button variant="outline" disabled={list.isFetching} onClick={() => void list.refetch()}>
            {ko.common.retry}
          </Button>
        </div>
      ) : list.isPending ? (
        <p role="status">{ko.common.loading}</p>
      ) : list.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {list.data.map((doc) => (
            <li key={doc.id} className="py-3">
              <Link
                href={`/documents/${encodeURIComponent(doc.id)}`}
                className="break-all font-medium underline underline-offset-4"
              >
                {doc.title}
              </Link>
              <p className="mt-1 break-all text-sm text-muted-foreground">
                {requestText.categories[doc.category]} · {doc.issue.signer.name}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
