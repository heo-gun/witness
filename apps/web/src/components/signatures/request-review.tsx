"use client";

import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ApiError } from "@/api/client";
import { inboxKey, rejectRequest, signRequest, type InboxItem } from "@/api/inbox";
import { getMemberActiveKeys } from "@/api/keys";
import { downloadEncryptedFile } from "@/api/signatures";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { KeyFingerprint } from "@/components/keys/key-fingerprint";
import { getPrivateKey, listLocalKeys } from "@/lib/crypto/keys";
import { decryptFile } from "@/lib/crypto/transfer";
import { signPayload } from "@/lib/crypto/sign";
import { previewType } from "@/lib/preview-type";
import { formatInboxTime } from "@/lib/inbox";
import { inboxText as t } from "@/lib/i18n/inbox";
import { ko } from "@/lib/i18n/ko";
import { requestText } from "@/lib/i18n/signature-requests";
import { workspaceErrorMessage } from "@/lib/workspace";
import { DocumentPreview } from "./document-preview";

class ReviewError extends Error {}

async function openRequest(item: InboxItem, userId: string, signal: AbortSignal) {
  const scope = { userId, orgId: item.orgId };
  const [encrypted, keys, local] = await Promise.all([
    downloadEncryptedFile(item.id, userId, signal),
    getMemberActiveKeys(item.org.slug, userId, userId, signal),
    listLocalKeys(scope).catch(() => {
      throw new ReviewError(t.missingDecryptKey);
    }),
  ]);
  const recipient = local.find(
    (k) => k.purpose === "encrypt" && k.fingerprint === encrypted.recipientFingerprint,
  );
  const secret = await getPrivateKey(scope, "encrypt", encrypted.recipientFingerprint).catch(() => {
    throw new ReviewError(t.missingDecryptKey);
  });
  if (!recipient || !secret) throw new ReviewError(t.missingDecryptKey);
  const { fileHash, plaintext } = await decryptFile(encrypted, recipient.publicKey, secret, {
    requestId: item.id,
    orgId: item.orgId,
    fileHash: item.document.fileHash,
    recipientFingerprint: recipient.fingerprint,
  }).catch(() => {
    throw new ReviewError(t.failedIntegrity);
  });
  const type = previewType(new Uint8Array(plaintext));
  if (!type) throw new ReviewError(t.unsupported);
  const signingKey = keys.find(
    (k) =>
      k.orgId === item.orgId &&
      k.userId === userId &&
      k.purpose === "sign" &&
      k.status === "active" &&
      local.some((l) => l.purpose === "sign" && l.fingerprint === k.fingerprint),
  );
  return { fileHash, file: new Blob([plaintext], { type }), fingerprint: signingKey?.fingerprint };
}

export function RequestReview({ item, userId }: { item: InboxItem; userId: string }) {
  return (
    <>
      <header className="space-y-2">
        <p className="break-words text-sm font-medium text-muted-foreground">
          {item.org.name} · {requestText.categories[item.document.category]}
        </p>
        <h1 className="break-all text-3xl font-semibold tracking-tight">{item.document.title}</h1>
        <p className="text-sm text-muted-foreground">
          {t.requester} {item.requester.name} ·{" "}
          <time dateTime={item.createdAt}>{formatInboxTime(item.createdAt)}</time>
        </p>
      </header>
      {item.status === "pending" || item.status === "needs_resend" ? (
        <DecisionForm
          key={JSON.stringify([
            item.status,
            item.orgId,
            item.documentId,
            item.document.fileHash,
            item.document.category,
            item.document.title,
          ])}
          item={item}
          userId={userId}
        />
      ) : (
        <Card className="space-y-3">
          <h2 className="text-xl font-semibold">{requestText.status[item.status]}</h2>
          {item.issue && (
            <>
              <p>
                {item.signer.name} · {ko.roles.signer}
              </p>
              <p className="text-sm">
                {t.signedAt} ·{" "}
                <time dateTime={item.issue.signedAt}>{formatInboxTime(item.issue.signedAt)}</time>
              </p>
              <p className="font-mono text-sm">Leaf index · {item.issue.leafIndex}</p>
              <KeyFingerprint value={item.issue.signerKeyFingerprint} />
            </>
          )}
          {item.rejectReason && (
            <p className="break-words whitespace-pre-wrap">
              {t.reason} · {item.rejectReason}
            </p>
          )}
        </Card>
      )}
    </>
  );
}

function DecisionForm({ item, userId }: { item: InboxItem; userId: string }) {
  const queryClient = useQueryClient();
  const [viewedFile, setViewedFile] = useState<Blob>();
  const [consent, setConsent] = useState<{ file: Blob; fingerprint: string }>();
  const [reason, setReason] = useState("");
  const [resendNote, setResendNote] = useState("");
  const reviewKey = [
    "signer-preview",
    userId,
    item.orgId,
    item.id,
    item.documentId,
    item.document.fileHash,
  ] as const;
  const review = useQuery({
    queryKey: reviewKey,
    queryFn: ({ signal }) => openRequest(item, userId, signal),
    enabled: item.status === "pending",
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
  });
  const file = review.data?.file;
  const fingerprint = review.data?.fingerprint;
  const viewed = !!file && viewedFile === file;
  const confirmed = !!consent && consent.file === file && consent.fingerprint === fingerprint;
  const onDisplayed = useCallback(
    (ok: boolean) => {
      setViewedFile(ok ? file : undefined);
      if (!ok) setConsent(undefined);
    },
    [file],
  );
  const ready = review.isSuccess && !review.isFetching && !!fingerprint && viewed && confirmed;
  const decision = useMutation({
    mutationFn: async (action: "sign" | "reject") => {
      if (action === "reject") return rejectRequest(item.id, userId, reason.trim());
      const data = review.data;
      if (!ready || !data?.fingerprint) throw new ReviewError(t.failedSign);
      const key = await getPrivateKey(
        { userId, orgId: item.orgId },
        "sign",
        data.fingerprint,
      ).catch(() => {
        throw new ReviewError(t.failedSign);
      });
      if (!key) throw new ReviewError(t.missingSigningKey);
      const signedAt = new Date().toISOString();
      const { category, title } = item.document;
      const payload = {
        action: "ISSUE" as const,
        orgId: item.orgId,
        documentId: item.documentId,
        signerId: userId,
        signerKeyFingerprint: data.fingerprint,
        fileHash: data.fileHash,
        title,
        category,
        signedAt,
      };
      const signature = await signPayload(payload, key).catch(() => {
        throw new ReviewError(t.failedSign);
      });
      return signRequest(item.id, userId, {
        fileHash: data.fileHash,
        signerKeyFingerprint: data.fingerprint,
        signedAt,
        signature,
      });
    },
    onSettled: async (_, error) => {
      await queryClient.invalidateQueries({ queryKey: inboxKey(userId) });
      if (error instanceof ApiError && error.status === 409) {
        onDisplayed(false);
        await queryClient.invalidateQueries({ queryKey: reviewKey });
      }
      if (!error)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["log"] }),
          queryClient.invalidateQueries({ queryKey: ["documents"] }),
        ]);
    },
  });
  function message(error: Error) {
    return error instanceof ReviewError ? error.message : workspaceErrorMessage(error, t.conflict);
  }
  return (
    <>
      {item.status === "needs_resend" ? (
        <Card className="space-y-3">
          <p>{t.resend}</p>
          <Button
            variant="outline"
            onClick={async () => {
              const note = t.resendMessage(item.document.title, item.id);
              try {
                await navigator.clipboard.writeText(note);
                setResendNote(t.copied);
              } catch {
                setResendNote(note);
              }
            }}
          >
            {t.copyResend}
          </Button>
          {resendNote && (
            <p role="status" className="select-all break-words text-sm">
              {resendNote}
            </p>
          )}
        </Card>
      ) : (
        <Card className="space-y-4">
          <h2 className="text-xl font-semibold">{t.preview}</h2>
          {review.isPending ? (
            <p role="status">{t.decrypting}</p>
          ) : review.error ? (
            <div role="alert" className="space-y-3">
              <p className="text-destructive">{message(review.error)}</p>
              <Button variant="outline" onClick={() => void review.refetch()}>
                {ko.common.retry}
              </Button>
            </div>
          ) : (
            <>
              <DocumentPreview
                key={review.dataUpdatedAt}
                file={review.data.file}
                onDisplayed={onDisplayed}
              />
              <p role="status" className="text-sm font-semibold text-valid">
                {t.integrity}
              </p>
              <p className="text-sm">
                {item.signer.name} · {ko.roles.signer}
              </p>
              {review.data.fingerprint ? (
                <KeyFingerprint value={review.data.fingerprint} />
              ) : (
                <p role="alert">
                  {t.missingSigningKey}{" "}
                  <Link
                    href={`/settings/keys?org=${encodeURIComponent(item.org.slug)}`}
                    className="text-sm underline"
                  >
                    {ko.common.myKeys}
                  </Link>
                </p>
              )}
              <label className="flex items-start gap-2 border-t border-border pt-4 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={confirmed}
                  onChange={(e) =>
                    setConsent(
                      e.target.checked && file && fingerprint ? { file, fingerprint } : undefined,
                    )
                  }
                  disabled={!viewed || !fingerprint || review.isFetching || decision.isPending}
                />
                {t.consent}
              </label>
              <Button
                disabled={!ready || decision.isPending}
                onClick={() => decision.mutate("sign")}
              >
                {decision.isPending && decision.variables === "sign" ? t.signing : t.sign}
              </Button>
            </>
          )}
        </Card>
      )}
      <Card className="space-y-3">
        <label className="block space-y-2">
          <span className="text-sm font-medium">{t.reason}</span>
          <Textarea
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            disabled={decision.isPending}
          />
        </label>
        <Button
          variant="outline"
          disabled={!reason.trim() || decision.isPending}
          onClick={() => decision.mutate("reject")}
        >
          {decision.isPending && decision.variables === "reject" ? t.rejecting : t.reject}
        </Button>
      </Card>
      {decision.error && (
        <p role="alert" className="text-sm text-destructive">
          {message(decision.error)}
        </p>
      )}
    </>
  );
}
