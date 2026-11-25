"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bytesToHex, type Category } from "@tlog/shared";
import { authKeys, type User } from "@/api/auth";
import { accessDenied, ApiError } from "@/api/client";
import { listMembers, memberKeys, type Member } from "@/api/members";
import {
  createSignatureRequest,
  existingRequest,
  type RequestInput,
  type RequestReference,
} from "@/api/signatures";
import { KeyFingerprint } from "@/components/keys/key-fingerprint";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useProtectedUserId } from "@/lib/auth";
import { ko } from "@/lib/i18n/ko";
import { requestText as t } from "@/lib/i18n/signature-requests";
import { useWorkspaceError, workspaceErrorMessage, workspaceRetry } from "@/lib/workspace";

export function NewSignatureRequest({ slug }: { slug: string }) {
  const userId = useProtectedUserId();
  const members = useQuery({
    queryKey: memberKeys.list(userId, slug),
    queryFn: ({ signal }) => listMembers(slug, userId, signal),
    retry: workspaceRetry,
  });
  const issuer = members.data?.some((m) => m.userId === userId && m.role === "issuer");
  return (
    <Card>
      {members.error ? (
        <div role="alert" className="space-y-4">
          <p>{workspaceErrorMessage(members.error)}</p>
          <Button
            variant="outline"
            disabled={members.isFetching}
            onClick={() => void members.refetch()}
          >
            {ko.common.retry}
          </Button>
        </div>
      ) : !members.data ? (
        <p role="status">{ko.common.loading}</p>
      ) : (
        !issuer && <p role="alert">{t.issuerOnly}</p>
      )}
      {issuer && members.data && !accessDenied(members.error) && (
        <div hidden={!!members.error} inert={!!members.error}>
          <RequestForm
            slug={slug}
            userId={userId}
            signers={members.data.filter((m) => m.role === "signer" && m.userId !== userId)}
          />
        </div>
      )}
    </Card>
  );
}

function RequestForm({
  slug,
  userId,
  signers,
}: {
  slug: string;
  userId: string;
  signers: Member[];
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("budget");
  const [signerId, setSignerId] = useState("");
  const [fileError, setFileError] = useState("");
  const client = useQueryClient();
  const handleError = useWorkspaceError(userId, slug);
  const hash = useMutation({
    gcTime: 0,
    mutationFn: async (file: File) =>
      bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))),
  });
  const create = useMutation({
    gcTime: 0,
    mutationFn: (input: RequestInput) => createSignatureRequest(slug, input, userId),
    onError: async (error) => {
      if (client.getQueryData<User | null>(authKeys.me)?.id !== userId) return;
      if (error instanceof ApiError && error.status === 400) {
        await client.invalidateQueries({ queryKey: memberKeys.list(userId, slug) });
      }
      await handleError(error);
    },
  });
  const eligible = signers.some((m) => m.userId === signerId && m.canReceiveSignatureRequest);
  const canCreate = !!hash.data && !!title.trim() && eligible && !create.isPending;
  function chooseFile(files: FileList | null) {
    const file = files?.item(0);
    if (create.isPending || !files || !file) return;
    create.reset();
    hash.reset();
    const error =
      files.length !== 1 ? t.countError : file.size > 20 * 1024 * 1024 ? t.sizeError : "";
    setFileError(error);
    if (!error) hash.mutate(file);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (canCreate && hash.data) {
      create.mutate({ title: title.trim(), category, fileHash: hash.data, signerId });
    }
  }
  if (create.data)
    return (
      <div role="status" className="space-y-3">
        <h2 className="text-xl font-semibold">{t.created}</h2>
        <RequestDetails request={create.data} />
        <p className="text-sm text-muted-foreground">{t.uploadHint}</p>
      </div>
    );
  const existing = existingRequest(create.error);
  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={create.isPending}>
      <fieldset disabled={create.isPending} className="min-w-0 space-y-5">
        <div>
          <label
            className="block cursor-pointer space-y-2 rounded-xl border border-dashed border-input bg-background p-5 text-center focus-within:outline-2 focus-within:outline-ring"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              chooseFile(event.dataTransfer.files);
            }}
          >
            <span className="block font-medium">{t.file}</span>
            <span className="block break-all text-sm">{hash.variables?.name || t.drop}</span>
            <span className="block text-xs text-muted-foreground">{t.fileHint}</span>
            <input
              type="file"
              aria-label={t.file}
              className="sr-only"
              onChange={(event) => {
                chooseFile(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          {hash.isPending && (
            <p className="mt-2 text-sm" role="status">
              {t.hashing}
            </p>
          )}
          {hash.data && (
            <div className="mt-2 flex items-baseline gap-2 text-xs text-muted-foreground">
              <span>SHA-256</span>
              <KeyFingerprint key={hash.data} value={hash.data} />
            </div>
          )}
          {(fileError || hash.isError) && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {fileError || t.hashError}
            </p>
          )}
        </div>
        <label className="block space-y-2">
          <span className="text-sm font-medium">{t.title}</span>
          <Input
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block min-w-0 space-y-2">
            <span className="text-sm font-medium">{t.category}</span>
            <Select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {Object.entries(t.categories).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block min-w-0 space-y-2">
            <span className="text-sm font-medium">{t.signer}</span>
            <Select
              required
              value={eligible ? signerId : ""}
              onChange={(e) => setSignerId(e.target.value)}
            >
              <option value="" disabled>
                {t.choose}
              </option>
              {signers.map((m) => (
                <option
                  key={m.userId}
                  value={m.userId}
                  disabled={!m.canReceiveSignatureRequest}
                  title={!m.canReceiveSignatureRequest ? t.noKey : undefined}
                >
                  {m.user.name} ({m.user.email}){!m.canReceiveSignatureRequest && ` · ${t.noKey}`}
                </option>
              ))}
            </Select>
          </label>
        </div>
        {!signers.some((m) => m.canReceiveSignatureRequest) && (
          <p className="text-sm text-muted-foreground">{t.noSigner}</p>
        )}
        <Button type="submit" className="w-full" disabled={!canCreate}>
          {create.isPending ? t.creating : t.create}
        </Button>
      </fieldset>
      {create.isError && (
        <div role="alert" className="space-y-2 text-sm">
          <p className="text-destructive">
            {create.error instanceof ApiError && create.error.status === 400
              ? t.changed
              : workspaceErrorMessage(create.error, t.duplicate)}
          </p>
          {existing && (
            <details>
              <summary className="cursor-pointer underline">{t.existing}</summary>
              <RequestDetails request={existing} />
            </details>
          )}
        </div>
      )}
    </form>
  );
}

function RequestDetails({ request }: { request: RequestReference }) {
  return (
    <div className="space-y-2 py-2">
      <p className="font-medium">{t.status[request.status]}</p>
      <p className="break-all text-sm text-muted-foreground">
        {t.requestId} · <code>{request.id}</code>
      </p>
    </div>
  );
}
