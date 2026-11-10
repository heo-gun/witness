"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { createOrg, orgKeys } from "@/api/orgs";
import type { Organization } from "@/api/orgs";
import { ApiError } from "@/api/client";
import { updateSession } from "@/lib/auth";
import { ko } from "@/lib/i18n/ko";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return ko.orgs.duplicateSlug;
    if (error.status === 400) return ko.orgs.invalidInput;
    if (error.status === 401) return ko.orgs.sessionExpired;
    return ko.common.serverError;
  }
  return ko.common.networkError;
}

export function CreateOrgForm({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: createOrg,
    onSuccess: async (organization) => {
      queryClient.setQueryData<Organization[]>(orgKeys.list(userId), (previous) => [
        organization,
        ...(previous ?? []).filter((org) => org.id !== organization.id),
      ]);
      formRef.current?.reset();
      toast.success(ko.orgs.created);
      await queryClient.invalidateQueries({ queryKey: orgKeys.lists });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      if (error instanceof ApiError && error.status === 401) void updateSession(queryClient, null);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (mutation.isPending) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (name.length === 0) {
      setValidationError(ko.orgs.invalidName);
      return;
    }
    setValidationError(null);
    mutation.mutate({
      name,
      slug: String(data.get("slug") ?? "")
        .trim()
        .toLowerCase(),
      description: String(data.get("description") ?? "").trim(),
    });
  }

  const error = validationError ?? (mutation.isError ? errorMessage(mutation.error) : null);
  return (
    <Card aria-labelledby="create-org-title" className="lg:sticky lg:top-8">
      <h2 id="create-org-title" className="text-xl font-semibold tracking-tight">
        {ko.orgs.createTitle}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{ko.orgs.createDescription}</p>
      <form
        ref={formRef}
        method="post"
        onSubmit={submit}
        aria-busy={mutation.isPending}
        className="mt-6 space-y-5"
      >
        <fieldset disabled={mutation.isPending} className="space-y-5 disabled:opacity-70">
          <div className="space-y-2">
            <label htmlFor="org-name" className="text-sm font-medium">
              {ko.orgs.name}
            </label>
            <Input
              id="org-name"
              name="name"
              required
              maxLength={100}
              placeholder={ko.orgs.namePlaceholder}
              autoComplete="organization"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="org-slug" className="text-sm font-medium">
              {ko.orgs.slug}
            </label>
            <Input
              id="org-slug"
              name="slug"
              required
              maxLength={64}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              placeholder={ko.orgs.slugPlaceholder}
              aria-describedby="org-slug-hint"
              aria-invalid={mutation.error instanceof ApiError && mutation.error.status === 409}
            />
            <p id="org-slug-hint" className="text-xs leading-5 text-muted-foreground">
              {ko.orgs.slugHint}
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="org-description" className="text-sm font-medium">
              {ko.orgs.description}{" "}
              <span className="font-normal text-muted-foreground">{ko.orgs.optional}</span>
            </label>
            <Textarea
              id="org-description"
              name="description"
              maxLength={500}
              placeholder={ko.orgs.descriptionPlaceholder}
            />
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm leading-6 text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="min-h-12 w-full" disabled={mutation.isPending}>
          {mutation.isPending ? ko.orgs.creating : ko.orgs.create}
        </Button>
      </form>
    </Card>
  );
}
