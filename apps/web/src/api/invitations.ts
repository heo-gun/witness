import { apiRequest } from "./client";
import type { Role } from "./members";

export interface Invitation {
  id: string;
  orgId: string;
  email: string;
  role: Role;
  invitedBy: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  createdAt: string;
  expiresAt: string | null;
  org: { id: string; name: string; slug: string };
}

export const invitationKeys = {
  list: (userId: string) => ["invitations", userId] as const,
};

export function inviteMember(
  slug: string,
  input: { email: string; role: "signer" | "issuer" },
  expectedUserId: string,
): Promise<Invitation & { invitationPath: string }> {
  return apiRequest(`/orgs/${encodeURIComponent(slug)}/invitations`, {
    method: "POST",
    body: input,
    expectedUserId,
  });
}

export function listMyInvitations(
  expectedUserId: string,
  signal?: AbortSignal,
): Promise<Invitation[]> {
  return apiRequest("/me/invitations", { expectedUserId, signal });
}

export function respondToInvitation(
  id: string,
  action: "accept" | "decline",
  token: string,
  expectedUserId: string,
): Promise<Invitation> {
  return apiRequest(`/invitations/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    body: { token },
    expectedUserId,
  });
}

export function cancelInvitation(
  slug: string,
  id: string,
  expectedUserId: string,
): Promise<Invitation> {
  return apiRequest(`/orgs/${encodeURIComponent(slug)}/invitations/${encodeURIComponent(id)}`, {
    method: "DELETE",
    body: {},
    expectedUserId,
  });
}
