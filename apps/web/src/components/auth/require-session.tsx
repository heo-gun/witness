"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ProtectedUserId, useSession } from "@/lib/auth";
import { ko } from "@/lib/i18n/ko";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmailAuthForm } from "./email-auth-form";
import { AuthForm } from "./auth-form";

export function RequireSession({
  children,
  signedOut,
}: {
  children: ReactNode;
  signedOut?: ReactNode;
}) {
  const session = useSession();
  const router = useRouter();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const verifiedId = session.data?.emailVerifiedAt ? session.data.id : null;
  if (session.data && verifiedId !== ownerId) setOwnerId(verifiedId);

  useEffect(() => {
    if (session.data === null && !session.isError && !ownerId && !signedOut)
      router.replace("/login");
  }, [session.data, session.isError, ownerId, signedOut, router]);

  let prompt: ReactNode;
  if (session.isError) {
    prompt = (
      <Card role="alert">
        <p>{ko.auth.sessionError}</p>
        <Button
          className="mt-5"
          disabled={session.isFetching}
          onClick={() => void session.refetch()}
        >
          {session.isFetching ? ko.common.loading : ko.common.retry}
        </Button>
      </Card>
    );
  } else if (session.data && !verifiedId) {
    prompt = <EmailAuthForm mode="verify_email" email={session.data.email} />;
  } else if (session.data === null && ownerId) {
    prompt = (
      <>
        <p role="status" className="mb-5">
          {ko.auth.resumeSession}
        </p>
        <AuthForm mode="login" stayOnPage />
      </>
    );
  } else if (!verifiedId) {
    prompt = (session.data === null && signedOut) || <p role="status">{ko.common.loading}</p>;
  }
  return (
    <>
      {ownerId && (
        <div key={ownerId} hidden={!!prompt} inert={!!prompt}>
          <ProtectedUserId.Provider value={ownerId}>{children}</ProtectedUserId.Provider>
        </div>
      )}
      {prompt && <main className="mx-auto max-w-xl px-5 py-16">{prompt}</main>}
    </>
  );
}
