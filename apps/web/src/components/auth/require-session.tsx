"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";
import { ko } from "@/lib/i18n/ko";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function RequireSession({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!session.isPending && !session.isError && !session.data) router.replace("/login");
  }, [session.isPending, session.isError, session.data, router]);

  if (session.isError) {
    return (
      <main id="main-content" className="mx-auto max-w-xl px-5 py-16">
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
      </main>
    );
  }
  if (!session.data) {
    return (
      <main
        id="main-content"
        role="status"
        className="mx-auto max-w-6xl px-5 py-16 text-muted-foreground"
      >
        {ko.common.loading}
      </main>
    );
  }
  return children;
}
