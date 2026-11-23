"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listKeys, keyQueries } from "@/api/keys";
import { listMembers, memberKeys } from "@/api/members";
import { listOrgs, orgKeys, type Organization } from "@/api/orgs";
import { useProtectedUserId } from "@/lib/auth";
import { listLocalKeys, type KeyScope } from "@/lib/crypto/keys";
import { ko } from "@/lib/i18n/ko";
import { personalKeys as text } from "@/lib/i18n/personal-keys";
import { workspaceErrorMessage, workspaceRetry } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { DeviceKeyCard } from "./device-key-card";

export function PersonalKeys({ initialSlug }: { initialSlug?: string }) {
  const userId = useProtectedUserId();
  const [slug, setSlug] = useState(initialSlug);
  const orgs = useQuery({
    queryKey: orgKeys.list(userId),
    queryFn: ({ signal }) => listOrgs(userId, signal),
    retry: workspaceRetry,
  });
  const selected = orgs.data?.find((org) => org.slug === slug) ?? orgs.data?.[0];
  return (
    <main id="main-content" className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <Link
        href="/dashboard"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        {ko.workspace.back}
      </Link>
      <header className="mt-7 mb-8 border-b border-border pb-6">
        <h1 className="text-4xl font-semibold tracking-tight text-primary">{ko.common.myKeys}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{text.description}</p>
      </header>
      {orgs.isError ? (
        <Card role="alert">
          <p>{workspaceErrorMessage(orgs.error)}</p>
          <Button variant="outline" className="mt-3" onClick={() => void orgs.refetch()}>
            {ko.common.retry}
          </Button>
        </Card>
      ) : orgs.isPending ? (
        <p role="status">{ko.common.loading}</p>
      ) : !selected ? (
        <Card>{text.noOrganizations}</Card>
      ) : (
        <>
          <label className="block max-w-md text-sm font-medium">
            {text.organization}
            <Select
              className="mt-2"
              value={selected.slug}
              onChange={(event) => setSlug(event.target.value)}
            >
              {orgs.data.map((org) => (
                <option key={org.id} value={org.slug}>
                  {org.name}
                </option>
              ))}
            </Select>
          </label>
          <OrgDeviceKeys key={selected.id} org={selected} userId={userId} />
        </>
      )}
    </main>
  );
}

const deviceQueryKey = (scope: KeyScope) => ["device-keys", scope] as const;

function OrgDeviceKeys({ org, userId }: { org: Organization; userId: string }) {
  const scope = { userId, orgId: org.id };
  const members = useQuery({
    queryKey: memberKeys.list(userId, org.slug),
    queryFn: ({ signal }) => listMembers(org.slug, userId, signal),
    retry: workspaceRetry,
  });
  const keys = useQuery({
    queryKey: keyQueries.list(userId, org.slug),
    queryFn: ({ signal }) => listKeys(org.slug, userId, signal),
    retry: workspaceRetry,
  });
  const local = useQuery({
    queryKey: deviceQueryKey(scope),
    queryFn: () => listLocalKeys(scope),
    retry: false,
    networkMode: "always",
  });
  const me = members.data?.find((member) => member.userId === userId);
  const refresh = () => {
    void members.refetch();
    void keys.refetch();
    void local.refetch();
  };
  const error = members.error ?? keys.error;
  if (error || (members.isSuccess && !me)) {
    return (
      <Card role="alert" className="mt-6">
        <p>{error ? workspaceErrorMessage(error) : ko.workspace.forbidden}</p>
        <Button variant="outline" className="mt-3" onClick={refresh}>
          {ko.common.retry}
        </Button>
      </Card>
    );
  }
  if (!me || !keys.data)
    return (
      <p role="status" className="mt-6">
        {ko.common.loading}
      </p>
    );
  const own = keys.data.filter((key) => key.userId === userId && key.orgId === org.id);
  const purposes =
    me.role === "signer" || own.some((key) => key.purpose === "sign")
      ? (["sign", "encrypt"] as const)
      : (["encrypt"] as const);
  return (
    <section aria-label={org.name} className="mt-6">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <p className="max-w-xl text-sm leading-6 text-muted-foreground">{text.deviceHint}</p>
        <Button
          variant="outline"
          onClick={refresh}
          disabled={keys.isFetching || members.isFetching || local.isFetching}
        >
          {text.refresh}
        </Button>
      </div>
      {local.isError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {text.localError}
        </p>
      )}
      <div className="grid items-start gap-5 md:grid-cols-2">
        {purposes.map((purpose) => (
          <DeviceKeyCard
            key={purpose}
            purpose={purpose}
            scope={scope}
            slug={org.slug}
            canRegister={purpose === "encrypt" || me.role === "signer"}
            keys={own.filter((key) => key.purpose === purpose)}
            local={
              local.isSuccess ? local.data.filter((key) => key.purpose === purpose) : undefined
            }
            refreshLocal={local.refetch}
          />
        ))}
      </div>
    </section>
  );
}
