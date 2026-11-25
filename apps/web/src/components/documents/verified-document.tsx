import Link from "next/link";
import { KeyFingerprint } from "@/components/keys/key-fingerprint";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  MissingTreeHeadError,
  type VerifiedPublicDocument,
  type VerifiedPublicDocuments,
} from "@/lib/crypto/verify";
import { documentText as t } from "@/lib/i18n/documents";
import { ko } from "@/lib/i18n/ko";
import { requestText } from "@/lib/i18n/signature-requests";

export function VerificationFailure({ error, retry }: { error?: unknown; retry: () => void }) {
  return (
    <Card role="alert" className="space-y-3">
      <h2 className="text-2xl font-semibold text-destructive">{t.failed}</h2>
      <p className="text-sm">{error instanceof MissingTreeHeadError ? t.noHead : t.failedHint}</p>
      <Button variant="outline" onClick={retry}>
        {ko.common.retry}
      </Button>
    </Card>
  );
}

export function VerifiedDocument({
  record,
  head,
  detail = false,
}: {
  record: VerifiedPublicDocument;
  head: VerifiedPublicDocuments["head"];
  detail?: boolean;
}) {
  const { document, issue, revocation } = record;
  return (
    <Card className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="break-words text-sm text-muted-foreground">
          {document.org.name} · {requestText.categories[issue.payload.category]}
        </p>
        <strong className={revocation ? "text-revoked" : "text-valid"}>
          {revocation ? t.revoked : t.valid}
        </strong>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">{t.approved}</p>
        <h2 className="break-all text-4xl font-semibold tracking-tight text-primary">
          {document.issue.signer.name}
        </h2>
        <p className="break-all pt-2 text-lg">{issue.payload.title}</p>
        <time
          className="block font-mono text-xs text-muted-foreground"
          dateTime={issue.payload.signedAt}
        >
          {issue.payload.signedAt}
        </time>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-border pt-3 font-mono text-xs">
        <span>Leaf index · {issue.leafIndex}</span>
        <span>
          Fingerprint · <KeyFingerprint value={issue.payload.signerKeyFingerprint} />
        </span>
      </div>
      {revocation && (
        <div className="space-y-1 border-l-2 border-revoked pl-4 text-sm">
          <p className="break-all font-medium">
            {t.revokedBy} · {document.revocation?.signer.name}
          </p>
          <p className="break-words whitespace-pre-wrap">
            {t.reason} · {revocation.payload.reason}
          </p>
          <time
            className="font-mono text-xs text-muted-foreground"
            dateTime={revocation.payload.signedAt}
          >
            {revocation.payload.signedAt}
          </time>
        </div>
      )}
      <p className="break-all font-mono text-xs text-muted-foreground">
        STH #{head.treeSize} · {head.timestamp}
      </p>
      {detail ? (
        <details className="border-t border-border pt-4 text-sm">
          <summary className="cursor-pointer font-medium">{t.evidence}</summary>
          <p className="mt-4 text-xs text-muted-foreground">{t.directory}</p>
          <dl className="mt-2 grid gap-1 break-all font-mono text-xs">
            <div>
              <dt className="inline">Org ID · </dt>
              <dd className="inline">{issue.payload.orgId}</dd>
            </div>
            <div>
              <dt className="inline">Signer ID · </dt>
              <dd className="inline">{issue.payload.signerId}</dd>
            </div>
            {revocation && (
              <div>
                <dt className="inline">Revoker ID · </dt>
                <dd className="inline">{revocation.payload.signerId}</dd>
              </div>
            )}
          </dl>
          <div className="mt-3 space-y-3">
            {[issue, ...(revocation ? [revocation] : [])].map((entry) => (
              <div key={entry.leafIndex}>
                <p className="font-mono">
                  {entry.payload.action} · Leaf index {entry.leafIndex}
                </p>
                <pre className="mt-1 select-all whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">
                  {entry.entryJson}
                </pre>
                <p className="mt-2 font-mono">Inclusion proof</p>
                <pre className="select-all whitespace-pre-wrap break-all text-xs">
                  {JSON.stringify(entry.auditPath, null, 2)}
                </pre>
              </div>
            ))}
            <p className="font-mono">Signed tree head</p>
            <pre className="select-all whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(head, null, 2)}
            </pre>
          </div>
        </details>
      ) : (
        <Link
          className="inline-block text-sm underline underline-offset-4"
          href={`/documents/${encodeURIComponent(issue.payload.documentId)}`}
        >
          {t.detail}
        </Link>
      )}
    </Card>
  );
}
