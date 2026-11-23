"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { accessDenied, ApiError } from "@/api/client";
import { invitationKeys, listMyInvitations, respondToInvitation } from "@/api/invitations";
import type { Invitation } from "@/api/invitations";
import { orgKeys } from "@/api/orgs";
import { ko } from "@/lib/i18n/ko";
import { useWorkspaceError, workspaceErrorMessage, workspaceRetry } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function ReceivedInvitations({
  userId,
  invitationId,
}: {
  userId: string;
  invitationId?: string;
}) {
  const queryClient = useQueryClient();
  const handleError = useWorkspaceError(userId);
  const invitations = useQuery({
    queryKey: invitationKeys.list(userId),
    queryFn: ({ signal }) => listMyInvitations(userId, signal),
    enabled: !!userId,
    retry: workspaceRetry,
  });
  const mutation = useMutation({
    mutationFn: ({
      id,
      action,
      token,
    }: {
      id: string;
      action: "accept" | "decline";
      token: string;
    }) => respondToInvitation(id, action, token, userId),
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

  const visible = invitations.data?.filter((item) => !invitationId || item.id === invitationId);
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
      ) : visible?.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-6 py-5 text-sm text-muted-foreground">
          {ko.invitations.empty}
        </p>
      ) : null}
      {visible && !accessDenied(invitations.error) && (
        <ul className={invitations.isError ? "hidden" : "grid gap-4 sm:grid-cols-2"}>
          {visible.map((invitation) => (
            <li key={invitation.id} className="min-w-0">
              <Card className="h-full p-6 sm:p-6">
                <h3 className="break-words font-semibold">{invitation.org.name}</h3>
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                  {invitation.org.slug}
                </p>
                <p className="mt-3 text-sm">
                  {ko.workspace.role}: {ko.roles[invitation.role]}
                </p>
                <form
                  className="mt-5 space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (mutation.isPending) return;
                    const data = new FormData(event.currentTarget);
                    const submitter = (event.nativeEvent as SubmitEvent)
                      .submitter as HTMLButtonElement | null;
                    const supplied = String(data.get("token") ?? "").trim();
                    const token = supplied || (invitationId ? window.location.hash.slice(1) : "");
                    mutation.mutate({
                      id: invitation.id,
                      action: submitter?.value === "decline" ? "decline" : "accept",
                      token,
                    });
                  }}
                >
                  {!invitationId && (
                    <Input
                      name="token"
                      aria-label={ko.invitations.token}
                      placeholder={ko.invitations.token}
                      required
                      pattern="[0-9a-f]{64}"
                      maxLength={64}
                      autoComplete="off"
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" value="accept" disabled={mutation.isPending}>
                      {ko.invitations.accept}
                    </Button>
                    <Button
                      variant="outline"
                      type="submit"
                      value="decline"
                      disabled={mutation.isPending}
                    >
                      {ko.invitations.decline}
                    </Button>
                  </div>
                </form>
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
