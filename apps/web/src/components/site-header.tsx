"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logout } from "@/api/auth";
import { authErrorMessage, updateSession, useSession } from "@/lib/auth";
import { ko } from "@/lib/i18n/ko";
import { Button, buttonVariants } from "./ui/button";

export function SiteHeader() {
  const session = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const mutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await updateSession(queryClient, null);
      toast.success(ko.auth.signedOut);
      router.replace("/login");
    },
    onError: (error) => toast.error(authErrorMessage(error)),
  });

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
        <Link
          href="/"
          aria-label={`${ko.brand} · ${ko.common.home}`}
          className="shrink-0 text-2xl font-bold tracking-[-0.06em] text-primary"
        >
          <span
            aria-hidden="true"
            className="mr-2 inline-block size-2 rounded-full bg-primary align-middle"
          />
          {ko.brand}
        </Link>
        <nav aria-label={ko.auth.eyebrow} className="flex min-w-0 items-center gap-2 sm:gap-4">
          {session.isPending ? (
            <span role="status" className="text-xs text-muted-foreground">
              {ko.common.loading}
            </span>
          ) : session.isError ? (
            <Button
              variant="ghost"
              title={ko.auth.sessionError}
              disabled={session.isFetching}
              onClick={() => void session.refetch()}
            >
              {session.isFetching ? ko.common.loading : ko.common.retry}
            </Button>
          ) : session.data ? (
            <>
              <Link
                href="/dashboard"
                aria-current={pathname === "/dashboard" ? "page" : undefined}
                className={buttonVariants({
                  variant: pathname === "/dashboard" ? "outline" : "ghost",
                })}
              >
                {ko.common.dashboard}
              </Link>
              <span
                className="hidden max-w-48 truncate text-sm text-muted-foreground sm:inline"
                title={session.data.name}
              >
                {session.data.name}
              </span>
              <Button
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? ko.auth.signingOut : ko.common.logout}
              </Button>
            </>
          ) : (
            <>
              <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
                {ko.common.login}
              </Link>
              <Link href="/register" className={buttonVariants()}>
                {ko.common.register}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
