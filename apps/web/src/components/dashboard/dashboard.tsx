"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listOrgs, orgKeys } from "@/api/orgs";
import { ApiError } from "@/api/client";
import { updateSession, useSession } from "@/lib/auth";
import { ko } from "@/lib/i18n/ko";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CreateOrgForm } from "./create-org-form";

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeZone: "Asia/Seoul",
});

export function Dashboard() {
  const session = useSession();
  const queryClient = useQueryClient();
  const userId = session.data?.id ?? "";
  const organizations = useQuery({
    queryKey: orgKeys.list(userId),
    queryFn: ({ signal }) => listOrgs(signal),
    enabled: !!userId,
    retry: (attempt, error) => attempt < 1 && (!(error instanceof ApiError) || error.status >= 500),
  });

  useEffect(() => {
    if (organizations.error instanceof ApiError && organizations.error.status === 401) {
      void updateSession(queryClient, null);
    }
  }, [organizations.error, queryClient]);

  return (
    <main id="main-content" className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="mb-10 border-b border-border pb-8">
        <p className="mb-4 font-mono text-xs tracking-[0.2em] text-muted-foreground">
          {ko.dashboard.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-[-0.05em] text-primary sm:text-5xl">
          {ko.dashboard.title}
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{ko.dashboard.description}</p>
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="org-list-title" className="min-w-0">
          <div className="mb-5 flex items-center gap-3">
            <h2 id="org-list-title" className="text-lg font-semibold">
              {ko.dashboard.myOrgs}
            </h2>
            {organizations.data && (
              <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
                {organizations.data.length}
              </span>
            )}
          </div>
          {organizations.isPending ? (
            <Card role="status" className="text-sm text-muted-foreground">
              {ko.common.loading}
            </Card>
          ) : organizations.isError ? (
            <Card role="alert">
              <p className="text-sm text-destructive">{ko.orgs.loadError}</p>
              <Button
                variant="outline"
                className="mt-4"
                disabled={organizations.isFetching}
                onClick={() => void organizations.refetch()}
              >
                {organizations.isFetching ? ko.common.loading : ko.common.retry}
              </Button>
            </Card>
          ) : organizations.data.length === 0 ? (
            <Card className="border-dashed bg-transparent shadow-none">
              <h3 className="font-medium">{ko.orgs.emptyTitle}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {ko.orgs.emptyDescription}
              </p>
            </Card>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {organizations.data.map((org) => (
                <li key={org.id} className="min-w-0">
                  <Card className="flex h-full flex-col p-6 sm:p-6">
                    <h3 className="break-words text-lg font-semibold tracking-tight">{org.name}</h3>
                    <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                      {org.slug}
                    </p>
                    {org.description && (
                      <p className="mt-4 whitespace-pre-line break-words text-sm leading-6 text-muted-foreground">
                        {org.description}
                      </p>
                    )}
                    <p className="mt-auto pt-6 text-xs text-muted-foreground">
                      {ko.orgs.createdAt}{" "}
                      <time dateTime={org.createdAt}>
                        {dateFormat.format(new Date(org.createdAt))}
                      </time>
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
        <CreateOrgForm key={userId} userId={userId} />
      </div>
    </main>
  );
}
