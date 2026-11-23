"use client";

import Link from "next/link";
import { RequireSession } from "@/components/auth/require-session";
import { useProtectedUserId } from "@/lib/auth";
import { ko } from "@/lib/i18n/ko";
import { AuthForm } from "@/components/auth/auth-form";
import { ReceivedInvitations } from "./received-invitations";

export function InvitationPage({ id }: { id: string }) {
  return (
    <RequireSession
      signedOut={
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
      }
    >
      <InvitationDetails id={id} />
    </RequireSession>
  );
}

function InvitationDetails({ id }: { id: string }) {
  const userId = useProtectedUserId();
  return (
    <main id="main-content" className="mx-auto max-w-xl px-5 py-12">
      <ReceivedInvitations userId={userId} invitationId={id} />
    </main>
  );
}
