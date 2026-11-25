"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { accessDenied, ApiError } from "@/api/client";
import { listMembers, memberKeys } from "@/api/members";
import { getOrg, orgKeys } from "@/api/orgs";
import { useProtectedUserId } from "@/lib/auth";
import { ko } from "@/lib/i18n/ko";
import { keyAdminText } from "@/lib/i18n/key-admin";
import { documentText } from "@/lib/i18n/documents";
import { requestText } from "@/lib/i18n/signature-requests";
import { workspaceErrorMessage, workspaceRetry } from "@/lib/workspace";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InviteMemberForm } from "./invite-member-form";
import { MembersPanel } from "./members-panel";
import { OrgKeysPanel } from "./org-keys-panel";
import { OrgSettingsForm } from "./org-settings-form";
import { OrgDocuments } from "./org-documents";

export function OrgDetails({
  slug,
  tab,
}: {
  slug: string;
  tab: "documents" | "members" | "settings" | "keys";
}) {
  const userId = useProtectedUserId();
  const organization = useQuery({
    queryKey: orgKeys.detail(userId, slug),
    queryFn: ({ signal }) => getOrg(slug, userId, signal),
    enabled: !!userId,
    retry: workspaceRetry,
  });
  const members = useQuery({
    queryKey: memberKeys.list(userId, slug),
    queryFn: ({ signal }) => listMembers(slug, userId, signal),
    enabled: !!userId,
    retry: workspaceRetry,
  });
  const error = organization.error ?? members.error;
  const role = members.data?.find((member) => member.userId === userId)?.role;
  const canManage = role === "owner";
  const href = `/orgs/${encodeURIComponent(slug)}`;

  return (
    <main id="main-content" className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <Link
        href="/dashboard"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        {ko.workspace.back}
      </Link>
      {error && (
        <Card role="alert" className="mt-8">
          <h1 className="text-xl font-semibold">{ko.workspace.loadError}</h1>
          <p className="mt-3 text-sm leading-6 text-destructive">{workspaceErrorMessage(error)}</p>
          <Button
            className="mt-5"
            variant="outline"
            disabled={organization.isFetching || members.isFetching}
            onClick={() => {
              void organization.refetch();
              void members.refetch();
            }}
          >
            {ko.common.retry}
          </Button>
        </Card>
      )}
      {!organization.data || !members.data ? (
        !error && (
          <Card role="status" className="mt-8">
            {ko.common.loading}
          </Card>
        )
      ) : accessDenied(organization.error) ||
        accessDenied(members.error) ? null : !members.data.some(
          (member) => member.userId === userId,
        ) ? (
        <Card role="alert" className="mt-8">
          {workspaceErrorMessage(new ApiError(403))}
        </Card>
      ) : (
        <div hidden={!!error} inert={!!error}>
          <div className="mt-8 mb-8 min-w-0">
            <p className="mb-3 font-mono text-xs tracking-[0.2em] text-muted-foreground">
              {ko.workspace.eyebrow}
            </p>
            <h1 className="break-words text-3xl font-semibold tracking-[-0.05em] text-primary sm:text-4xl">
              {organization.data.name}
            </h1>
            <p className="mt-3 break-all font-mono text-xs text-muted-foreground">
              {organization.data.slug}
            </p>
            {organization.data.description && (
              <p className="mt-4 max-w-3xl whitespace-pre-line break-words text-sm leading-6 text-muted-foreground">
                {organization.data.description}
              </p>
            )}
            <div className="mt-5">
              {role === "issuer" ? (
                <Link href={`${href}/new`} className={buttonVariants()}>
                  {requestText.create}
                </Link>
              ) : (
                <span title={requestText.issuerOnly}>
                  <Button disabled aria-label={requestText.issuerOnly}>
                    {requestText.create}
                  </Button>
                </span>
              )}
            </div>
          </div>
          <nav
            aria-label={ko.workspace.eyebrow}
            className="mb-8 flex flex-wrap gap-2 border-b border-border pb-4"
          >
            <Link
              href={`${href}?tab=documents`}
              aria-current={tab === "documents" ? "page" : undefined}
              className={buttonVariants({ variant: tab === "documents" ? "default" : "ghost" })}
            >
              {documentText.documents}
            </Link>
            <Link
              href={href}
              aria-current={tab === "members" ? "page" : undefined}
              className={buttonVariants({ variant: tab === "members" ? "default" : "ghost" })}
            >
              {ko.workspace.members}
            </Link>
            {canManage && (
              <Link
                href={`${href}?tab=keys`}
                aria-current={tab === "keys" ? "page" : undefined}
                className={buttonVariants({ variant: tab === "keys" ? "default" : "ghost" })}
              >
                {keyAdminText.title}
              </Link>
            )}
            {canManage && (
              <Link
                href={`${href}?tab=settings`}
                aria-current={tab === "settings" ? "page" : undefined}
                className={buttonVariants({ variant: tab === "settings" ? "default" : "ghost" })}
              >
                {ko.workspace.settings}
              </Link>
            )}
          </nav>
          {tab === "documents" ? (
            <OrgDocuments slug={slug} />
          ) : tab === "keys" ? (
            canManage ? (
              <OrgKeysPanel
                key={`${userId}-${slug}`}
                userId={userId}
                slug={slug}
                members={members.data}
              />
            ) : (
              <Card role="alert">{keyAdminText.ownerOnly}</Card>
            )
          ) : tab === "settings" ? (
            canManage ? (
              <OrgSettingsForm
                key={`${userId}-${slug}`}
                userId={userId}
                organization={organization.data}
              />
            ) : (
              <Card role="alert">{ko.workspace.ownerOnly}</Card>
            )
          ) : (
            <div
              className={
                canManage
                  ? "grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]"
                  : "max-w-3xl"
              }
            >
              <MembersPanel
                key={`${userId}-${slug}`}
                userId={userId}
                slug={slug}
                members={members.data}
                canManage={canManage}
              />
              {canManage && (
                <InviteMemberForm key={`${userId}-${slug}`} userId={userId} slug={slug} />
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
