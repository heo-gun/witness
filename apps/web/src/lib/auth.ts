"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { authKeys, getMe } from "@/api/auth";
import type { User } from "@/api/auth";
import { accessDenied, ApiError } from "@/api/client";
import { ko } from "./i18n/ko";

export const ProtectedUserId = createContext<string | null>(null);

export function useProtectedUserId() {
  const id = useContext(ProtectedUserId);
  if (!id) throw new Error("Protected content requires a verified session");
  return id;
}

export function useSession() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: async ({ signal, client }) => {
      const user = await getMe(signal);
      if (user && client.getQueryData<User | null>(authKeys.me)?.id !== user.id) {
        // Check memberships before revealing a returning user's mounted forms.
        const active = client.getQueryCache().findAll({
          type: "active",
          predicate: (q) => q.queryKey.includes(user.id),
        });
        await client.refetchQueries({ predicate: (q) => active.includes(q) });
        for (const { state } of active) {
          if (state.fetchStatus !== "idle") throw new Error("Session check is pending");
          if (state.error instanceof ApiError && state.error.status === 401) return null;
          if (state.error && !accessDenied(state.error)) throw state.error;
        }
      }
      return user;
    },
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data ? 60_000 : false),
    refetchOnWindowFocus: "always",
    retry: (attempt, error) =>
      attempt < 1 && (!(error instanceof ApiError) || error.status === 412 || error.status >= 500),
  });
}

export async function updateSession(queryClient: QueryClient, user: User | null): Promise<void> {
  await queryClient.cancelQueries();
  queryClient.removeQueries({
    predicate: ({ queryKey }) => queryKey[0] !== "auth" && !(user && queryKey.includes(user.id)),
  });
  if (!user) queryClient.setQueryData(authKeys.me, null);
  await queryClient.invalidateQueries({ queryKey: authKeys.me });
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return ko.common.rateLimited;
    if (error.status === 401) return ko.auth.invalidCredentials;
    if (error.status === 412) return ko.auth.accountChanged;
    if (error.status === 400) return ko.auth.invalidInput;
    if (error.status === 403 || error.status === 415) return ko.auth.unavailable;
    return ko.common.serverError;
  }
  return ko.common.networkError;
}
