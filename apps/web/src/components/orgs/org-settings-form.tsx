"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { orgKeys, updateOrg } from "@/api/orgs";
import type { Organization } from "@/api/orgs";
import { ko } from "@/lib/i18n/ko";
import { useWorkspaceError, workspaceErrorMessage } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function OrgSettingsForm({
  userId,
  organization,
}: {
  userId: string;
  organization: Organization;
}) {
  const queryClient = useQueryClient();
  const handleError = useWorkspaceError(userId, organization.slug);
  const [validationError, setValidationError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (input: Pick<Organization, "name" | "description">) =>
      updateOrg(organization.slug, input),
    onSuccess: async (result) => {
      queryClient.setQueryData(orgKeys.detail(userId, result.slug), result);
      toast.success(ko.workspace.updated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orgKeys.detail(userId, result.slug) }),
        queryClient.invalidateQueries({ queryKey: orgKeys.list(userId) }),
      ]);
    },
    onError: async (error) => {
      toast.error(workspaceErrorMessage(error));
      await handleError(error);
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (!name) {
      setValidationError(ko.orgs.invalidName);
      return;
    }
    setValidationError(null);
    mutation.mutate({ name, description: String(data.get("description") ?? "").trim() });
  }
  const error =
    validationError ?? (mutation.isError ? workspaceErrorMessage(mutation.error) : null);
  return (
    <Card aria-labelledby="org-settings-title" className="max-w-2xl">
      <h2 id="org-settings-title" className="text-xl font-semibold">
        {ko.workspace.settings}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {ko.workspace.settingsDescription}
      </p>
      <form onSubmit={submit} aria-busy={mutation.isPending} className="mt-6 space-y-5">
        <fieldset disabled={mutation.isPending} className="space-y-5 disabled:opacity-70">
          <div className="space-y-2">
            <label htmlFor="settings-name" className="text-sm font-medium">
              {ko.orgs.name}
            </label>
            <Input
              id="settings-name"
              name="name"
              required
              maxLength={100}
              defaultValue={organization.name}
              autoComplete="organization"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="settings-slug" className="text-sm font-medium">
              {ko.orgs.slug}
            </label>
            <Input
              id="settings-slug"
              value={organization.slug}
              readOnly
              aria-describedby="settings-slug-hint"
            />
            <p id="settings-slug-hint" className="text-xs text-muted-foreground">
              {ko.orgs.slugHint}
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="settings-description" className="text-sm font-medium">
              {ko.orgs.description}
            </label>
            <Textarea
              id="settings-description"
              name="description"
              maxLength={500}
              defaultValue={organization.description}
            />
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? ko.common.saving : ko.common.save}
        </Button>
      </form>
    </Card>
  );
}
