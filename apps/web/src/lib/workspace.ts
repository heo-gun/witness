"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authKeys } from "@/api/auth";
import type { User } from "@/api/auth";
import { ApiError } from "@/api/client";
import { memberKeys } from "@/api/members";
import { orgKeys } from "@/api/orgs";
import { updateSession } from "./auth";
import { ko } from "./i18n/ko";

export function workspaceRetry(attempt: number, error: Error): boolean {
  return attempt < 1 && (!(error instanceof ApiError) || error.status >= 500);
}

export function workspaceErrorMessage(
  error: unknown,
  conflict: string = ko.common.serverError,
): string {
  if (!(error instanceof ApiError)) return ko.common.networkError;
  if (error.status === 401) return ko.orgs.sessionExpired;
  if (error.status === 403) return ko.workspace.forbidden;
  if (error.status === 404) return ko.workspace.notFound;
  if (error.status === 409) return conflict;
  if (error.status === 400) return ko.orgs.invalidInput;
  return ko.common.serverError;
}

export function useWorkspaceError(userId: string, slug?: string) {
  const queryClient = useQueryClient();
  return async (error: unknown): Promise<void> => {
    if (queryClient.getQueryData<User | null>(authKeys.me)?.id !== userId) return;
    if (error instanceof ApiError && error.status === 401) {
      await updateSession(queryClient, null);
    } else if (error instanceof ApiError && [403, 404, 409].includes(error.status) && slug) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: memberKeys.list(userId, slug) }),
        queryClient.invalidateQueries({ queryKey: orgKeys.detail(userId, slug) }),
        queryClient.invalidateQueries({ queryKey: orgKeys.list(userId) }),
      ]);
    }
  };
}

export function useWorkspaceSessionExpiry(userId: string, error: unknown): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (
      error instanceof ApiError &&
      error.status === 401 &&
      queryClient.getQueryData<User | null>(authKeys.me)?.id === userId
    ) {
      void updateSession(queryClient, null);
    }
  }, [error, queryClient, userId]);
}
