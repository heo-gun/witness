"use client";

import { useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { authKeys, getMe } from "@/api/auth";
import type { User } from "@/api/auth";
import { ApiError } from "@/api/client";
import { ko } from "./i18n/ko";

export function useSession() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: ({ signal }) => getMe(signal),
    staleTime: 30_000,
    retry: (attempt, error) => attempt < 1 && (!(error instanceof ApiError) || error.status >= 500),
  });
}

export async function updateSession(queryClient: QueryClient, user: User | null): Promise<void> {
  await queryClient.cancelQueries();
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
  queryClient.setQueryData(authKeys.me, user);
  await queryClient.invalidateQueries({ queryKey: authKeys.me });
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return ko.auth.invalidCredentials;
    if (error.status === 409) return ko.auth.duplicateEmail;
    if (error.status === 400) return ko.auth.invalidInput;
    if (error.status === 403 || error.status === 415) return ko.auth.unavailable;
    return ko.common.serverError;
  }
  return ko.common.networkError;
}
