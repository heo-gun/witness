import { apiRequest } from "./client";

export type Role = "owner" | "signer" | "issuer";

export interface Member {
  userId: string;
  orgId: string;
  role: Role;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

export const memberKeys = {
  list: (userId: string, slug: string) => ["members", userId, slug] as const,
};

export function listMembers(slug: string, signal?: AbortSignal): Promise<Member[]> {
  return apiRequest(`/orgs/${encodeURIComponent(slug)}/members`, { signal });
}

export function changeRole(slug: string, userId: string, role: Role): Promise<Member> {
  return apiRequest(`/orgs/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: { role },
  });
}

export function removeMember(slug: string, userId: string): Promise<void> {
  return apiRequest(`/orgs/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    body: {},
  });
}
