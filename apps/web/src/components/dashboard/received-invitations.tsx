"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { invitationKeys, listMyInvitations, respondToInvitation } from "@/api/invitations";
import type { Invitation } from "@/api/invitations";
import { orgKeys } from "@/api/orgs";
import { ko } from "@/lib/i18n/ko";
import {
  useWorkspaceError,
  useWorkspaceSessionExpiry,
  workspaceErrorMessage,
  workspaceRetry,
} from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ReceivedInvitations({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const handleError = useWorkspaceError(userId);
  const invitations = useQuery({
    queryKey: invitationKeys.list(userId),
    queryFn: ({ signal }) => listMyInvitations(signal),
    enabled: !!userId,
    retry: workspaceRetry,
  });
  useWorkspaceSessionExpiry(userId, invitations.error);
  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "accept" | "decline" }) =>
      respondToInvitation(id, action),
    onSuccess: async (result) => {
      queryClient.setQueryData<Invitation[]>(invitationKeys.list(userId), (previous) =>
        previous?.filter((item) => item.id !== result.id),
      );
      toast.success(
        result.status === "accepted" ? ko.invitations.accepted : ko.invitations.declined,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: invitationKeys.list(userId) }),
        queryClient.invalidateQueries({ queryKey: orgKeys.list(userId) }),
      ]);
    },
    onError: async (error) => {
      toast.error(workspaceErrorMessage(error, ko.invitations.conflict));
      await handleError(error);
      if (error instanceof ApiError && [403, 404, 409].includes(error.status)) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: invitationKeys.list(userId) }),
          queryClient.invalidateQueries({ queryKey: orgKeys.list(userId) }),
        ]);
      }
    },
  });

  return (
    <section aria-labelledby="invitations-title" className="mb-10 min-w-0">
      <h2 id="invitations-title" className="text-lg font-semibold">
        {ko.invitations.title}
      </h2>
      <p className="mt-2 mb-5 text-sm text-muted-foreground">{ko.invitations.description}</p>
      {invitations.isPending ? (
        <Card role="status">{ko.common.loading}</Card>
      ) : invitations.isError ? (
        <Card role="alert">
          <p className="text-sm text-destructive">{ko.invitations.loadError}</p>
          <Button
            className="mt-4"
            variant="outline"
            disabled={invitations.isFetching}
            onClick={() => void invitations.refetch()}
          >
            {ko.common.retry}
          </Button>
        </Card>
      ) : invitations.data.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-6 py-5 text-sm text-muted-foreground">
          {ko.invitations.empty}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {invitations.data.map((invitation) => (
            <li key={invitation.id} className="min-w-0">
              <Card className="h-full p-6 sm:p-6">
                <h3 className="break-words font-semibold">{invitation.org.name}</h3>
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                  {invitation.org.slug}
                </p>
                <p className="mt-3 text-sm">
                  {ko.workspace.role}: {ko.roles[invitation.role]}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ id: invitation.id, action: "accept" })}
                  >
                    {ko.invitations.accept}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ id: invitation.id, action: "decline" })}
                  >
                    {ko.invitations.decline}
                  </Button>
                </div>
                {mutation.isPending && mutation.variables.id === invitation.id && (
                  <p role="status" className="mt-3 text-sm text-muted-foreground">
                    {ko.invitations.processing}
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {mutation.isError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {workspaceErrorMessage(mutation.error, ko.invitations.conflict)}
        </p>
      )}
    </section>
  );
}
