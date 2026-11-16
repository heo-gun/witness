"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { inviteMember } from "@/api/invitations";
import type { Role } from "@/api/members";
import { ko } from "@/lib/i18n/ko";
import { useWorkspaceError, workspaceErrorMessage } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RoleOptions } from "./role-options";

export function InviteMemberForm({ userId, slug }: { userId: string; slug: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const handleError = useWorkspaceError(userId, slug);
  const mutation = useMutation({
    mutationFn: (input: { email: string; role: Role }) => inviteMember(slug, input),
    onSuccess: () => {
      formRef.current?.reset();
      toast.success(ko.workspace.invited);
    },
    onError: async (error) => {
      toast.error(workspaceErrorMessage(error, ko.workspace.inviteConflict));
      await handleError(error);
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const data = new FormData(event.currentTarget);
    mutation.mutate({
      email: String(data.get("email") ?? "")
        .trim()
        .toLowerCase(),
      role: String(data.get("role")) as Role,
    });
  }
  return (
    <Card aria-labelledby="invite-member-title">
      <h2 id="invite-member-title" className="text-xl font-semibold">
        {ko.workspace.inviteTitle}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {ko.workspace.inviteDescription}
      </p>
      <form
        ref={formRef}
        onSubmit={submit}
        aria-busy={mutation.isPending}
        className="mt-6 space-y-5"
      >
        <fieldset disabled={mutation.isPending} className="space-y-5 disabled:opacity-70">
          <div className="space-y-2">
            <label htmlFor="invite-email" className="text-sm font-medium">
              {ko.auth.email}
            </label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              required
              maxLength={254}
              autoCapitalize="none"
              autoComplete="off"
              placeholder={ko.auth.emailPlaceholder}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="invite-role" className="text-sm font-medium">
              {ko.workspace.role}
            </label>
            <Select id="invite-role" name="role" defaultValue="issuer">
              <RoleOptions />
            </Select>
          </div>
        </fieldset>
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {workspaceErrorMessage(mutation.error, ko.workspace.inviteConflict)}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? ko.workspace.inviting : ko.workspace.invite}
        </Button>
      </form>
    </Card>
  );
}
