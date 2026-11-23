"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authKeys, type User } from "@/api/auth";
import { approveKey, keyQueries, listKeys, revokeKey, type MemberKey } from "@/api/keys";
import type { Member } from "@/api/members";
import { KeyFingerprint } from "@/components/keys/key-fingerprint";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { keyAdminText as t } from "@/lib/i18n/key-admin";
import { ko } from "@/lib/i18n/ko";
import { useWorkspaceError, workspaceErrorMessage, workspaceRetry } from "@/lib/workspace";

type Action = { type: "approve"; id: string } | { type: "revoke"; id: string; reason: string };
const dates = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "long",
  timeZone: "Asia/Seoul",
});

function ReviewDate({ value }: { value: string | null }) {
  return value ? <time dateTime={value}>{dates.format(new Date(value))}</time> : t.noInvitation;
}

export function OrgKeysPanel({
  userId,
  slug,
  members,
}: {
  userId: string;
  slug: string;
  members: Member[];
}) {
  const client = useQueryClient();
  const handleError = useWorkspaceError(userId, slug);
  const queryKey = keyQueries.list(userId, slug);
  const keys = useQuery({
    queryKey,
    queryFn: ({ signal }) => listKeys(slug, userId, signal),
    retry: workspaceRetry,
  });
  const mutation = useMutation({
    mutationFn: (action: Action) =>
      action.type === "approve"
        ? approveKey(action.id, userId)
        : revokeKey(action.id, action.reason, userId),
    onSuccess: async (_, action) => {
      if (client.getQueryData<User | null>(authKeys.me)?.id !== userId) return;
      toast.success(action.type === "approve" ? t.approved : t.revoked);
      await Promise.all([
        client.invalidateQueries({ queryKey }),
        client.invalidateQueries({ queryKey: ["log"] }),
      ]);
    },
    onError: async (error) => {
      if (client.getQueryData<User | null>(authKeys.me)?.id !== userId) return;
      await Promise.all([handleError(error), client.invalidateQueries({ queryKey })]);
    },
  });
  const membersById = new Map(members.map((member) => [member.userId, member]));
  return (
    <Card aria-labelledby="key-admin-title" className="min-w-0 max-w-3xl">
      <h2 id="key-admin-title" className="text-xl font-semibold">
        {t.title}
      </h2>
      {keys.isError ? (
        <div className="mt-4 space-y-3" role="alert">
          <p className="text-sm text-destructive">{workspaceErrorMessage(keys.error)}</p>
          <Button variant="outline" disabled={keys.isFetching} onClick={() => void keys.refetch()}>
            {ko.common.retry}
          </Button>
        </div>
      ) : !keys.data ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          {ko.common.loading}
        </p>
      ) : keys.data.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <ul className="mt-5 divide-y divide-border">
          {keys.data.map((item) => (
            <KeyRow
              key={[
                item.id,
                item.status,
                item.review?.accountCreatedAt,
                item.review?.invitationCreatedAt,
                item.review?.invitationAcceptedAt,
              ].join("/")}
              item={item}
              member={membersById.get(item.userId)}
              busy={mutation.isPending}
              onAction={(action) => mutation.mutate(action)}
              error={
                mutation.isError && mutation.variables.id === item.id
                  ? workspaceErrorMessage(mutation.error, t.conflict)
                  : undefined
              }
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function KeyRow({
  item,
  member,
  busy,
  onAction,
  error,
}: {
  item: MemberKey;
  member?: Member;
  busy: boolean;
  onAction: (action: Action) => void;
  error?: string;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [reason, setReason] = useState("");
  const review = item.review;
  return (
    <li className="space-y-4 py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-semibold">{member?.user.name ?? item.userId}</h3>
          {member && <p className="break-all text-sm text-muted-foreground">{member.user.email}</p>}
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs">{t.status[item.status]}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span>{t.purpose[item.purpose]}</span>
        <KeyFingerprint value={item.fingerprint} />
      </div>
      {item.status === "pending" && review && (
        <>
          <dl className="grid gap-3 rounded-lg bg-muted p-3 text-xs sm:grid-cols-3">
            {[
              [t.accountCreatedAt, review.accountCreatedAt],
              [t.invitationCreatedAt, review.invitationCreatedAt],
              [t.invitationAcceptedAt, review.invitationAcceptedAt],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="mt-1">
                  <ReviewDate value={value ?? null} />
                </dd>
              </div>
            ))}
          </dl>
          {review.invitationCreatedAt &&
            Date.parse(review.accountCreatedAt) < Date.parse(review.invitationCreatedAt) && (
              <p className="inline-block rounded-lg border border-border px-3 py-2 text-xs font-medium text-destructive">
                {t.beforeInvitation}
              </p>
            )}
        </>
      )}
      {item.status !== "revoked" && review && (
        <fieldset disabled={busy} className="min-w-0 space-y-3">
          {item.status === "pending" && !revoking && (
            <label className="flex items-start gap-2 text-sm leading-6">
              <input
                className="mt-1 size-4 shrink-0 accent-primary"
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              {t.confirmation}
            </label>
          )}
          {revoking ? (
            <div className="space-y-2">
              <label htmlFor={`revoke-${item.id}`} className="text-sm font-medium">
                {t.revokeReason}
              </label>
              <Textarea
                id={`revoke-${item.id}`}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                aria-describedby={`reason-hint-${item.id}`}
              />
              <p id={`reason-hint-${item.id}`} className="text-xs text-muted-foreground">
                {t.revokeHint}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="text-destructive"
                  disabled={!reason.trim()}
                  onClick={() => onAction({ type: "revoke", id: item.id, reason: reason.trim() })}
                >
                  {t.confirmRevoke}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setRevoking(false);
                    setReason("");
                  }}
                >
                  {ko.common.cancel}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {item.status === "pending" && (
                <Button
                  disabled={!confirmed}
                  onClick={() => onAction({ type: "approve", id: item.id })}
                >
                  {t.approve}
                </Button>
              )}
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => {
                  setRevoking(true);
                  setConfirmed(false);
                }}
              >
                {t.revoke}
              </Button>
            </div>
          )}
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}
