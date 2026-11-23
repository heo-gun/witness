import type { KeyPurpose } from "@tlog/shared";
import { apiRequest } from "./client";

export type { KeyPurpose };

export interface MemberKey {
  id: string;
  userId: string;
  orgId: string;
  purpose: KeyPurpose;
  publicKey: string;
  fingerprint: string;
  status: "pending" | "active" | "revoked";
  createdAt: string;
  approvedAt: string | null;
  revokedAt: string | null;
  review?: {
    accountCreatedAt: string;
    invitationCreatedAt: string | null;
    invitationAcceptedAt: string | null;
  };
}

export const keyQueries = {
  list: (userId: string, slug: string) => ["keys", userId, slug] as const,
};

export function listKeys(
  slug: string,
  expectedUserId: string,
  signal?: AbortSignal,
): Promise<MemberKey[]> {
  return apiRequest(`/orgs/${encodeURIComponent(slug)}/keys`, { expectedUserId, signal });
}

export function registerKey(
  slug: string,
  input: Pick<MemberKey, "purpose" | "publicKey">,
  expectedUserId: string,
): Promise<MemberKey> {
  return apiRequest(`/orgs/${encodeURIComponent(slug)}/keys`, {
    method: "POST",
    body: { purpose: input.purpose, publicKey: input.publicKey },
    expectedUserId,
  });
}

export function approveKey(id: string, expectedUserId: string): Promise<MemberKey> {
  return apiRequest(`/keys/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    body: {},
    expectedUserId,
  });
}

export function revokeKey(id: string, reason: string, expectedUserId: string): Promise<MemberKey> {
  return apiRequest(`/keys/${encodeURIComponent(id)}/revoke`, {
    method: "POST",
    body: { reason },
    expectedUserId,
  });
}
