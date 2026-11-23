"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { keyQueries, listKeys, registerKey, type MemberKey } from "@/api/keys";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  generateMemberKeys,
  type KeyPurpose,
  type KeyScope,
  type LocalPublicKey,
} from "@/lib/crypto/keys";
import { personalKeys as text } from "@/lib/i18n/personal-keys";
import { useWorkspaceError, workspaceErrorMessage } from "@/lib/workspace";
import { KeyFingerprint } from "./key-fingerprint";

class DeviceKeyError extends Error {}

export function DeviceKeyCard({
  purpose,
  scope,
  slug,
  keys,
  local,
  canRegister,
  refreshLocal,
}: {
  purpose: KeyPurpose;
  scope: KeyScope;
  slug: string;
  keys: MemberKey[];
  local?: LocalPublicKey[];
  canRegister: boolean;
  refreshLocal: () => Promise<unknown>;
}) {
  const client = useQueryClient();
  const handleError = useWorkspaceError(scope.userId, slug);
  const registration = useMutation({
    gcTime: 0,
    mutationFn: async () => {
      let candidate: LocalPublicKey;
      try {
        candidate = await generateMemberKeys(
          scope,
          purpose,
          keys.map((key) => key.fingerprint),
        );
      } catch {
        throw new DeviceKeyError(text.generateError);
      }
      // The private key has committed locally before the public key leaves this browser.
      await refreshLocal();
      try {
        await registerKey(slug, { purpose, publicKey: candidate.publicKey }, scope.userId);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 409)) throw error;
        const fresh = await listKeys(slug, scope.userId);
        if (
          !fresh.some(
            (key) =>
              key.userId === scope.userId &&
              key.orgId === scope.orgId &&
              key.purpose === purpose &&
              key.publicKey === candidate.publicKey &&
              key.fingerprint === candidate.fingerprint &&
              key.status !== "revoked",
          )
        )
          throw error;
      }
    },
    onError: handleError,
    onSettled: () => client.invalidateQueries({ queryKey: keyQueries.list(scope.userId, slug) }),
  });
  const localPrints = new Set(local?.map((key) => key.fingerprint));
  const unsent = local?.find(
    (key) => !keys.some((registered) => key.fingerprint === registered.fingerprint),
  );
  const pendingHere = keys.some(
    (key) => key.status === "pending" && localPrints.has(key.fingerprint),
  );
  const active = keys.some((key) => key.status === "active");
  const title = text.purpose[purpose];
  return (
    <Card className="min-w-0 p-5 sm:p-6" aria-labelledby={`title-${purpose}`}>
      <h2 className="text-xl font-semibold text-primary" id={`title-${purpose}`}>
        {title}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{text.use[purpose]}</p>
      {keys.length === 0 && !unsent ? (
        <p className="my-6 text-sm">{text.empty}</p>
      ) : (
        <ul className="my-4 divide-y divide-border">
          {unsent && (
            <li className="py-3">
              <p className="text-sm font-medium">{text.unsent}</p>
              <KeyFingerprint value={unsent.fingerprint} />
            </li>
          )}
          {keys.map((key) => (
            <li key={key.id} className="py-3">
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span
                  className={
                    { pending: "text-pending", active: "text-valid", revoked: "text-revoked" }[
                      key.status
                    ] + " text-sm font-semibold"
                  }
                >
                  {text.status[key.status]}
                </span>
                {local && (
                  <span className="text-xs text-muted-foreground">
                    {localPrints.has(key.fingerprint) ? text.local : text.missing}
                  </span>
                )}
              </p>
              <KeyFingerprint value={key.fingerprint} />
            </li>
          ))}
        </ul>
      )}
      {registration.isError && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {registration.error instanceof DeviceKeyError
            ? registration.error.message
            : workspaceErrorMessage(registration.error, text.conflict)}
        </p>
      )}
      {canRegister &&
        (pendingHere && !unsent ? (
          <p role="status" className="text-sm leading-6 text-muted-foreground">
            {active ? text.replacementHint : text.wait}
          </p>
        ) : (
          <>
            {active && (
              <p className="mb-3 text-xs leading-5 text-muted-foreground">{text.replacementHint}</p>
            )}
            <Button
              disabled={registration.isPending || !local}
              variant={active ? "outline" : "default"}
              onClick={() => registration.mutate()}
            >
              {registration.isPending
                ? text.registering
                : unsent
                  ? text.retry
                  : active
                    ? text.replace
                    : text.create}
              <span className="sr-only"> · {title}</span>
            </Button>
          </>
        ))}
    </Card>
  );
}
