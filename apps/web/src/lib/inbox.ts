"use client";

import { useQuery } from "@tanstack/react-query";
import { inboxKey, listInbox } from "@/api/inbox";
import { workspaceRetry } from "./workspace";

export function useInbox(userId: string) {
  return useQuery({
    queryKey: inboxKey(userId),
    queryFn: ({ signal }) => listInbox(userId, signal),
    staleTime: 10_000,
    refetchInterval: 30_000,
    retry: workspaceRetry,
  });
}

const formatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});
export const formatInboxTime = (time: string) => formatter.format(new Date(time));
