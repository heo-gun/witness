"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth";
import { ko } from "@/lib/i18n/ko";
import { AuthForm } from "@/components/auth/auth-form";
import { EmailAuthForm } from "@/components/auth/email-auth-form";
import { Button } from "@/components/ui/button";
import { ReceivedInvitations } from "./received-invitations";

export function InvitationPage({ id }: { id: string }) {
  const session = useSession();
  return (
    <main id="main-content" className="mx-auto max-w-xl px-5 py-12">
      {session.isPending ? (
        <p role="status">{ko.common.loading}</p>
      ) : session.isError ? (
        <div role="alert">
          <p>{ko.auth.sessionError}</p>
          <Button onClick={() => void session.refetch()}>{ko.common.retry}</Button>
        </div>
      ) : session.data ? (
        session.data.emailVerifiedAt ? (
          <ReceivedInvitations key={session.data.id} userId={session.data.id} invitationId={id} />
        ) : (
          <EmailAuthForm mode="verify_email" email={session.data.email} />
        )
      ) : (
        <>
          <p className="mb-5">{ko.invitations.loginHint}</p>
          <AuthForm mode="login" stayOnPage />
          <Link
            href="/register"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-block underline"
          >
            {ko.invitations.registerHint}
          </Link>
        </>
      )}
    </main>
  );
}
