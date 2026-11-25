"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { revokeDocument } from "@/api/documents";
import { getMemberActiveKeys } from "@/api/keys";
import { listMembers, memberKeys } from "@/api/members";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/auth";
import { getPrivateKey, listLocalKeys } from "@/lib/crypto/keys";
import { signPayload } from "@/lib/crypto/sign";
import type { VerifiedPublicDocument } from "@/lib/crypto/verify";
import { documentText as t } from "@/lib/i18n/documents";
import { inboxText } from "@/lib/i18n/inbox";
import { ko } from "@/lib/i18n/ko";
import { workspaceErrorMessage, workspaceRetry } from "@/lib/workspace";

export function RevokeDocument({ record }: { record: VerifiedPublicDocument }) {
  const session = useSession();
  const userId = session.data?.emailVerifiedAt && !session.error ? session.data.id : "";
  const slug = record.document.org.slug;
  const orgId = record.issue.payload.orgId;
  const members = useQuery({
    queryKey: memberKeys.list(userId, slug),
    queryFn: ({ signal }) => listMembers(slug, userId, signal),
    enabled: !!userId,
    retry: workspaceRetry,
  });
  const signer = members.data?.find(
    (m) => m.userId === userId && m.orgId === orgId && m.role === "signer",
  );
  if (userId && signer && !members.error) {
    return (
      <RevokeForm
        key={JSON.stringify([userId, orgId, record.issue.leafIndex])}
        userId={userId}
        record={record}
      />
    );
  }
  const checking = session.isPending || (!!userId && members.isPending);
  const error =
    session.error ??
    (members.error instanceof ApiError && [403, 404].includes(members.error.status)
      ? null
      : members.error);
  return (
    <div className="space-y-2">
      <span title={t.signerOnly}>
        <Button disabled>{t.revoke}</Button>
      </span>
      <p className="text-xs text-muted-foreground">
        {checking ? ko.common.loading : error ? workspaceErrorMessage(error) : t.signerOnly}
      </p>
    </div>
  );
}

function RevokeForm({ record, userId }: { record: VerifiedPublicDocument; userId: string }) {
  const client = useQueryClient();
  const [reason, setReason] = useState("");
  const { document, issue } = record;
  const { orgId, documentId } = issue.payload;
  const key = useQuery({
    queryKey: ["revoke-key", userId, orgId, document.org.slug],
    queryFn: async ({ signal }) => {
      const [keys, local] = await Promise.all([
        getMemberActiveKeys(document.org.slug, userId, userId, signal),
        listLocalKeys({ userId, orgId }),
      ]);
      return (
        keys.find(
          (k) =>
            k.orgId === orgId &&
            k.userId === userId &&
            k.purpose === "sign" &&
            k.status === "active" &&
            local.some((l) => l.purpose === "sign" && l.fingerprint === k.fingerprint),
        )?.fingerprint ?? null
      );
    },
    retry: workspaceRetry,
  });
  const revoke = useMutation({
    mutationFn: async () => {
      const fingerprint = key.data;
      const secret = fingerprint && (await getPrivateKey({ userId, orgId }, "sign", fingerprint));
      if (!secret || !fingerprint) throw new Error(inboxText.missingSigningKey);
      const payload = {
        action: "REVOKE" as const,
        orgId,
        documentId,
        targetLeafIndex: issue.leafIndex,
        signerId: userId,
        signerKeyFingerprint: fingerprint,
        signedAt: new Date().toISOString(),
        reason: reason.trim(),
      };
      const signature = await signPayload(payload, secret);
      return revokeDocument(
        documentId,
        {
          targetLeafIndex: payload.targetLeafIndex,
          reason: payload.reason,
          signerKeyFingerprint: fingerprint,
          signedAt: payload.signedAt,
          signature,
        },
        userId,
      );
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? workspaceErrorMessage(error, t.conflict) : inboxText.failedSign,
      ),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["documents"] }),
        client.invalidateQueries({ queryKey: ["log"] }),
        client.invalidateQueries({ queryKey: memberKeys.list(userId, document.org.slug) }),
        client.invalidateQueries({ queryKey: ["revoke-key", userId, orgId] }),
      ]);
    },
  });
  const ready =
    !!reason.trim() && key.isSuccess && !key.isFetching && !!key.data && !revoke.isPending;
  return (
    <Card>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) revoke.mutate();
        }}
      >
        <label className="block space-y-2">
          <span className="font-medium">{t.reason}</span>
          <Textarea
            required
            maxLength={500}
            value={reason}
            disabled={revoke.isPending}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <p className="text-sm text-muted-foreground">{t.revokeHint}</p>
        {key.isPending ? (
          <p role="status" className="text-sm">
            {ko.common.loading}
          </p>
        ) : (
          (!key.data || key.isError) && (
            <p role="status" className="text-sm text-muted-foreground">
              {key.error instanceof ApiError
                ? workspaceErrorMessage(key.error)
                : inboxText.missingSigningKey}
            </p>
          )
        )}
        <Button type="submit" disabled={!ready}>
          {revoke.isPending ? t.revoking : t.revoke}
        </Button>
      </form>
    </Card>
  );
}
