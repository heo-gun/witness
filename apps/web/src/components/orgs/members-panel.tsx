"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { changeRole, memberKeys, removeMember } from "@/api/members";
import type { Member, Role } from "@/api/members";
import { orgKeys } from "@/api/orgs";
import type { Organization } from "@/api/orgs";
import { ko } from "@/lib/i18n/ko";
import { useWorkspaceError, workspaceErrorMessage } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { RoleOptions } from "./role-options";

type MemberAction =
  { type: "role"; userId: string; role: Role } | { type: "remove"; userId: string };

export function MembersPanel({
  userId,
  slug,
  members,
  canManage,
}: {
  userId: string;
  slug: string;
  members: Member[];
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const handleError = useWorkspaceError(userId, slug);
  const ownerCount = members.filter((member) => member.role === "owner").length;
  const mutation = useMutation({
    mutationFn: async (action: MemberAction): Promise<Member | void> =>
      action.type === "role"
        ? changeRole(slug, action.userId, action.role)
        : removeMember(slug, action.userId),
    onSuccess: async (result, action) => {
      queryClient.setQueryData<Member[]>(memberKeys.list(userId, slug), (previous) =>
        previous?.flatMap((member) =>
          member.userId !== action.userId ? [member] : result ? [result] : [],
        ),
      );
      toast.success(action.type === "role" ? ko.workspace.roleChanged : ko.workspace.removed);
      if (action.type === "remove" && action.userId === userId) {
        queryClient.setQueryData<Organization[]>(orgKeys.list(userId), (previous) =>
          previous?.filter((org) => org.slug !== slug),
        );
        queryClient.removeQueries({ queryKey: orgKeys.detail(userId, slug) });
        router.replace("/dashboard");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: memberKeys.list(userId, slug) }),
        queryClient.invalidateQueries({ queryKey: orgKeys.detail(userId, slug) }),
        queryClient.invalidateQueries({ queryKey: orgKeys.list(userId) }),
      ]);
    },
    onError: async (error) => {
      toast.error(workspaceErrorMessage(error, ko.workspace.memberConflict));
      await handleError(error);
    },
  });

  return (
    <Card aria-labelledby="members-title" className="min-w-0">
      <div className="flex items-center gap-3">
        <h2 id="members-title" className="text-xl font-semibold">
          {ko.workspace.members}
        </h2>
        <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-xs">
          {members.length}
        </span>
      </div>
      {canManage && (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{ko.workspace.lastOwnerHint}</p>
      )}
      <ul className="mt-6 divide-y divide-border">
        {members.map((member) => (
          <MemberRow
            key={`${member.userId}-${member.role}`}
            member={member}
            isMe={member.userId === userId}
            canManage={canManage}
            lastOwner={member.role === "owner" && ownerCount === 1}
            busy={mutation.isPending}
            onAction={(action) => mutation.mutate(action)}
          />
        ))}
      </ul>
      {mutation.isPending && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {ko.common.saving}
        </p>
      )}
      {mutation.isError && (
        <p role="alert" className="mt-4 text-sm leading-6 text-destructive">
          {workspaceErrorMessage(mutation.error, ko.workspace.memberConflict)}
        </p>
      )}
    </Card>
  );
}

function MemberRow({
  member,
  isMe,
  canManage,
  lastOwner,
  busy,
  onAction,
}: {
  member: Member;
  isMe: boolean;
  canManage: boolean;
  lastOwner: boolean;
  busy: boolean;
  onAction: (action: MemberAction) => void;
}) {
  const [role, setRole] = useState(member.role);
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="break-words font-medium">
            {member.user.name}
            {isMe && (
              <span className="ml-2 text-xs text-muted-foreground">({ko.workspace.me})</span>
            )}
          </h3>
          <p className="mt-1 break-all text-sm text-muted-foreground">{member.user.email}</p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs">
          {ko.roles[member.role]}
        </span>
      </div>
      {canManage && (
        <fieldset disabled={busy} className="mt-4 min-w-0 space-y-3 disabled:opacity-70">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 basis-32">
              <label
                htmlFor={`role-${member.userId}`}
                className="mb-2 block text-xs text-muted-foreground"
              >
                {ko.workspace.role}
              </label>
              <Select
                id={`role-${member.userId}`}
                value={role}
                disabled={lastOwner}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                <RoleOptions />
              </Select>
            </div>
            <Button
              variant="outline"
              disabled={lastOwner || role === member.role}
              onClick={() => onAction({ type: "role", userId: member.userId, role })}
            >
              {ko.workspace.changeRole}
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={lastOwner}
              onClick={() => setConfirming(true)}
            >
              {ko.workspace.remove}
            </Button>
          </div>
          {confirming && (
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="text-sm leading-6">{ko.workspace.removeHint}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={() => onAction({ type: "remove", userId: member.userId })}
                >
                  {ko.workspace.confirmRemove}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  {ko.common.cancel}
                </Button>
              </div>
            </div>
          )}
        </fieldset>
      )}
    </li>
  );
}
