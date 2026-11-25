"use client";

import Link from "next/link";
import { formatInboxTime, useInbox } from "@/lib/inbox";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useProtectedUserId } from "@/lib/auth";
import { inboxText as t } from "@/lib/i18n/inbox";
import { ko } from "@/lib/i18n/ko";
import { requestText } from "@/lib/i18n/signature-requests";
import { workspaceErrorMessage } from "@/lib/workspace";
import { RequestReview } from "./request-review";

export function Inbox({ requestId }: { requestId?: string }) {
  const userId = useProtectedUserId();
  const inbox = useInbox(userId);
  const item = inbox.data?.find((row) => row.id === requestId && row.signerId === userId);
  return (
    <main id="main-content" className="mx-auto max-w-4xl space-y-6 px-5 py-10 sm:px-8 sm:py-14">
      {requestId ? (
        <Link href="/inbox" className="text-sm underline">
          {t.back}
        </Link>
      ) : (
        <h1 className="border-b border-border pb-6 text-3xl font-semibold tracking-tight">
          {t.title}
        </h1>
      )}
      {inbox.error ? (
        <Card role="alert">
          <p>{workspaceErrorMessage(inbox.error)}</p>
          <Button variant="outline" className="mt-4" onClick={() => void inbox.refetch()}>
            {ko.common.retry}
          </Button>
        </Card>
      ) : !inbox.data ? (
        <Card role="status">{ko.common.loading}</Card>
      ) : requestId ? (
        item ? (
          <RequestReview key={item.id} item={item} userId={userId} />
        ) : (
          <Card role="alert">{t.missing}</Card>
        )
      ) : !inbox.data.length ? (
        <Card>{t.empty}</Card>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {inbox.data.map((row) => (
            <li key={row.id}>
              <Link
                href={`/inbox/${encodeURIComponent(row.id)}`}
                className="block space-y-2 p-5 focus-visible:outline-2 hover:bg-muted"
              >
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="min-w-0 break-all text-lg font-semibold">
                    {row.document.title}
                  </span>
                  <span className="text-sm font-medium">{requestText.status[row.status]}</span>
                </span>
                <span className="block break-words text-sm text-muted-foreground">
                  {row.org.name} · {row.requester.name} ·{" "}
                  <time dateTime={row.createdAt}>{formatInboxTime(row.createdAt)}</time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
