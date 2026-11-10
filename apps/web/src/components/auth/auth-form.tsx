"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { login, register } from "@/api/auth";
import type { RegisterInput } from "@/api/auth";
import { authErrorMessage, updateSession, useSession } from "@/lib/auth";
import { ko } from "@/lib/i18n/ko";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (input: RegisterInput) =>
      isRegister ? register(input) : login({ email: input.email, password: input.password }),
    onSuccess: async (user) => {
      if (isRegister) {
        toast.success(ko.auth.registered);
        router.replace("/login");
      } else {
        await updateSession(queryClient, user);
        router.replace("/");
      }
    },
    onError: (error) => toast.error(authErrorMessage(error)),
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (mutation.isPending) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (isRegister && (name.length === 0 || Array.from(name).length > 50)) {
      setFormError(ko.auth.invalidName);
      return;
    }
    if (isRegister && password !== data.get("confirmPassword")) {
      setFormError(ko.auth.passwordMismatch);
      return;
    }
    setFormError(null);
    mutation.mutate({
      name,
      email: String(data.get("email") ?? "")
        .trim()
        .toLowerCase(),
      password,
    });
  }

  if (session.data) {
    return (
      <Card aria-labelledby="auth-title">
        <h1 id="auth-title" className="text-2xl font-semibold tracking-tight">
          {ko.auth.alreadySignedIn}
        </h1>
        <p className="mt-3 break-all text-sm text-muted-foreground">{session.data.email}</p>
        <Link href="/" className={buttonVariants({ className: "mt-6 w-full" })}>
          {ko.auth.continueHome}
        </Link>
      </Card>
    );
  }

  const error = formError ?? (mutation.isError ? authErrorMessage(mutation.error) : null);
  return (
    <Card aria-labelledby="auth-title">
      <h1 id="auth-title" className="text-3xl font-semibold tracking-tight">
        {isRegister ? ko.auth.signUpTitle : ko.auth.signInTitle}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {isRegister ? ko.auth.signUpDescription : ko.auth.signInDescription}
      </p>
      <form
        method="post"
        onSubmit={submit}
        className="mt-8 space-y-5"
        aria-busy={mutation.isPending}
      >
        <fieldset disabled={mutation.isPending} className="space-y-5 disabled:opacity-70">
          {isRegister && (
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                {ko.auth.name}
              </label>
              <Input
                id="name"
                name="name"
                autoComplete="name"
                required
                maxLength={50}
                placeholder={ko.auth.namePlaceholder}
              />
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              {ko.auth.email}
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={254}
              placeholder={ko.auth.emailPlaceholder}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="password" className="text-sm font-medium">
                {ko.auth.password}
              </label>
              <button
                type="button"
                className="rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={showPassword ? ko.auth.hidePasswordLabel : ko.auth.showPasswordLabel}
                aria-controls="password"
                aria-pressed={showPassword}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? ko.auth.hidePassword : ko.auth.showPassword}
              </button>
            </div>
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
              minLength={8}
              maxLength={128}
              aria-describedby={isRegister ? "password-hint" : undefined}
            />
            {isRegister && (
              <p id="password-hint" className="text-xs leading-5 text-muted-foreground">
                {ko.auth.passwordHint}
              </p>
            )}
          </div>
          {isRegister && (
            <div className="space-y-2">
              <label htmlFor="confirm-password" className="text-sm font-medium">
                {ko.auth.confirmPassword}
              </label>
              <Input
                id="confirm-password"
                name="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                aria-invalid={formError === ko.auth.passwordMismatch}
                aria-describedby={error ? "form-error" : undefined}
              />
            </div>
          )}
        </fieldset>
        {error && (
          <p id="form-error" role="alert" className="text-sm leading-6 text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="min-h-12 w-full" disabled={mutation.isPending}>
          {mutation.isPending
            ? isRegister
              ? ko.auth.signingUp
              : ko.auth.signingIn
            : isRegister
              ? ko.common.register
              : ko.common.login}
        </Button>
      </form>
      <p className="mt-7 border-t border-border pt-6 text-center text-sm text-muted-foreground">
        {isRegister ? ko.auth.hasAccount : ko.auth.noAccount}{" "}
        <Link
          href={isRegister ? "/login" : "/register"}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {isRegister ? ko.common.login : ko.common.register}
        </Link>
      </p>
    </Card>
  );
}
