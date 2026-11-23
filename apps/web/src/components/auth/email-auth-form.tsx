"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { changePassword, confirmEmail, requestEmail } from "@/api/auth";
import { ApiError } from "@/api/client";
import { authErrorMessage, updateSession } from "@/lib/auth";
import { ko } from "@/lib/i18n/ko";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function EmailConfirmation() {
  const [link, setLink] = useState({ version: 0, verify: false });
  useEffect(() => {
    const update = () => {
      const verify = window.location.hash.startsWith("#verify_email:");
      setLink(({ version }) => ({ version: version + 1, verify }));
    };
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return <EmailAuthForm key={link.version} mode="confirm" initialNameRequired={link.verify} />;
}

export function EmailAuthForm({
  mode,
  email = "",
  initialNameRequired = false,
}: {
  mode: "verify_email" | "reset_password" | "confirm" | "change";
  email?: string;
  initialNameRequired?: boolean;
}) {
  const queryClient = useQueryClient();
  const [localError, setLocalError] = useState<string | null>(null);
  const [requiresName, setRequiresName] = useState(initialNameRequired);
  const requestMode = mode === "verify_email" || mode === "reset_password";
  const mutation = useMutation({
    mutationFn: async ({ data, fragment }: { data: FormData; fragment: string }) => {
      if (requestMode) {
        await requestEmail(String(data.get("email")).trim().toLowerCase(), mode);
      } else if (mode === "change") {
        await changePassword(String(data.get("currentPassword")), String(data.get("password")));
      } else {
        if (window.location.hash !== fragment) throw new Error(ko.emailAuth.invalidToken);
        const match = /^#(verify_email|reset_password):([0-9a-f]{64})$/.exec(fragment);
        if (!match || !match[2]) throw new Error(ko.emailAuth.invalidToken);
        const purpose = match[1] === "verify_email" ? "verify_email" : "reset_password";
        await confirmEmail(
          match[2],
          purpose,
          String(data.get("password")),
          requiresName ? String(data.get("name")).trim() : undefined,
        );
        if (window.location.hash === fragment) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
    },
    onError: (error) => {
      if (mode === "confirm" && error instanceof ApiError && error.status === 422) {
        setRequiresName(true);
      }
    },
    onSuccess: async () => {
      if (!requestMode) {
        toast.success(ko.emailAuth.done);
        await updateSession(queryClient, null);
      }
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const data = new FormData(event.currentTarget);
    if (requiresName && !String(data.get("name")).trim()) {
      setLocalError(ko.auth.invalidName);
      return;
    }
    if (!requestMode && data.get("password") !== data.get("confirmPassword")) {
      setLocalError(ko.auth.passwordMismatch);
      return;
    }
    setLocalError(null);
    mutation.mutate({ data, fragment: mode === "confirm" ? window.location.hash : "" });
  }
  const error =
    localError ??
    (mutation.isError
      ? mutation.error instanceof ApiError
        ? mutation.error.status === 409
          ? ko.emailAuth.manualRecovery
          : mutation.error.status === 422 && mode === "confirm"
            ? ko.emailAuth.nameRequired
            : mutation.error.status === 400 && !requestMode
              ? ko.emailAuth.invalidToken
              : authErrorMessage(mutation.error)
        : mutation.error.message === ko.emailAuth.invalidToken
          ? ko.emailAuth.invalidToken
          : ko.common.networkError
      : null);
  return (
    <Card>
      <h1 className="text-2xl font-semibold">
        {mode === "verify_email"
          ? ko.emailAuth.verify
          : mode === "reset_password"
            ? ko.emailAuth.recover
            : mode === "change"
              ? ko.emailAuth.change
              : ko.emailAuth.confirm}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {requestMode ? ko.emailAuth.hint : ko.emailAuth.confirmHint}
      </p>
      {mutation.isSuccess && (
        <p role="status" className="mt-5">
          {requestMode ? ko.emailAuth.sent : ko.emailAuth.done}
        </p>
      )}
      {(!mutation.isSuccess || requestMode) && (
        <form
          method="post"
          onSubmit={submit}
          className="mt-6 space-y-4"
          aria-busy={mutation.isPending}
        >
          <fieldset disabled={mutation.isPending} className="space-y-4">
            {requestMode ? (
              <div>
                <label htmlFor="mail-email">{ko.auth.email}</label>
                <Input
                  id="mail-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  defaultValue={email}
                  required
                  maxLength={254}
                />
              </div>
            ) : (
              <>
                {requiresName && (
                  <div>
                    <label htmlFor="confirm-name">{ko.auth.name}</label>
                    <Input
                      id="confirm-name"
                      name="name"
                      autoComplete="name"
                      required
                      maxLength={50}
                    />
                  </div>
                )}
                {mode === "change" && (
                  <div>
                    <label htmlFor="current-password">{ko.emailAuth.currentPassword}</label>
                    <Input
                      id="current-password"
                      name="currentPassword"
                      type="password"
                      autoComplete="current-password"
                      required
                      minLength={8}
                      maxLength={128}
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="new-password">{ko.emailAuth.confirm}</label>
                  <Input
                    id="new-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                  />
                </div>
                <div>
                  <label htmlFor="repeat-password">{ko.auth.confirmPassword}</label>
                  <Input
                    id="repeat-password"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                  />
                </div>
              </>
            )}
            <Button className="w-full" type="submit">
              {mutation.isPending
                ? ko.common.loading
                : requestMode
                  ? ko.emailAuth.send
                  : ko.common.save}
            </Button>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      )}
      <div className="mt-6 flex flex-wrap gap-4 text-sm underline">
        <Link href="/login">{ko.common.login}</Link>
        <Link href="/verify-email">{ko.emailAuth.verify}</Link>
        <Link href="/recover">{ko.emailAuth.recover}</Link>
      </div>
    </Card>
  );
}
