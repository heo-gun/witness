"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { bytesToHex } from "@tlog/shared";
import { useSession } from "@/lib/auth";
import { documentText as t } from "@/lib/i18n/documents";
import { requestText } from "@/lib/i18n/signature-requests";
import { useVerifiedDocuments } from "@/lib/use-verified-documents";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { VerificationFailure, VerifiedDocument } from "./verified-document";

export function PublicVerification() {
  const session = useSession();
  const [fileError, setFileError] = useState("");
  const hash = useMutation({
    gcTime: 0,
    mutationFn: async (file: File) =>
      bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))),
  });
  const lookup = useVerifiedDocuments(hash.data);

  function choose(files: FileList | null) {
    if (!files?.length) return;
    hash.reset();
    setFileError(files.length > 1 ? requestText.countError : "");
    const file = files.item(0);
    if (files.length === 1 && file) hash.mutate(file);
  }

  return (
    <div className="space-y-5">
      <label
        className="block cursor-pointer space-y-3 rounded-2xl border border-dashed border-input bg-card px-5 py-10 text-center hover:border-primary focus-within:outline-2 focus-within:outline-ring"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          choose(event.dataTransfer.files);
        }}
      >
        <span className="block font-medium">{t.drop}</span>
        <span className="block text-sm text-muted-foreground">{t.privateHash}</span>
        <input
          type="file"
          aria-label={t.verify}
          className="sr-only"
          onChange={(event) => {
            choose(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      {(fileError || hash.error) && (
        <p role="alert" className="text-destructive">
          {fileError || requestText.hashError}
        </p>
      )}
      {hash.isPending && <p role="status">{requestText.hashing}</p>}
      {hash.data && (
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="break-all font-medium">{hash.variables?.name}</p>
            <p className="select-all break-all font-mono text-xs text-muted-foreground">
              SHA-256 · {hash.data}
            </p>
          </div>
          {lookup.isFetching || lookup.isPending ? (
            <p role="status">{t.checking}</p>
          ) : lookup.isError ? (
            <VerificationFailure error={lookup.error} retry={() => void lookup.refetch()} />
          ) : (
            <>
              {lookup.data.documents.length > 0 ? (
                <>
                  {lookup.data.documents.map((record) => (
                    <VerifiedDocument
                      key={record.document.id}
                      record={record}
                      head={lookup.data.head}
                    />
                  ))}
                  <ol className="space-y-1 text-sm text-valid" aria-label={t.verify}>
                    {t.steps.map((step, index) => (
                      <li
                        key={step}
                        className="verification-step"
                        style={{ animationDelay: `${index * 65}ms` }}
                      >
                        <span aria-hidden="true">✓ </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <Card className="space-y-3">
                  <h2 className="text-2xl font-semibold text-unregistered">{t.unregistered}</h2>
                  <p>{t.noRecord}</p>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    STH #{lookup.data.head.treeSize} · {lookup.data.head.timestamp}
                  </p>
                  {!session.error && session.data?.emailVerifiedAt && (
                    <Link
                      href="/dashboard"
                      title={t.selectOrg}
                      className={buttonVariants({ variant: "outline" })}
                    >
                      {t.register}
                    </Link>
                  )}
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
