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
): Promise<Invitation & { invitationPath: string }> {
  return apiRequest(`/orgs/${encodeURIComponent(slug)}/invitations`, {
    method: "POST",
    body: input,
  });
}

export function listMyInvitations(signal?: AbortSignal): Promise<Invitation[]> {
  return apiRequest("/me/invitations", { signal });
}

export function respondToInvitation(
  id: string,
  action: "accept" | "decline",
  token: string,
): Promise<Invitation> {
  return apiRequest(`/invitations/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    body: { token },
  });
}

export function cancelInvitation(slug: string, id: string): Promise<Invitation> {
  return apiRequest(`/orgs/${encodeURIComponent(slug)}/invitations/${encodeURIComponent(id)}`, {
    method: "DELETE",
    body: {},
  });
}
