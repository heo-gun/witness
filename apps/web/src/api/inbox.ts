import type { Category } from "@tlog/shared";
import { apiRequest } from "./client";
import type { RequestReference } from "./signatures";

export interface InboxItem extends RequestReference {
  orgId: string;
  requesterId: string;
  createdAt: string;
  decidedAt: string | null;
  rejectReason: string | null;
  org: { name: string; slug: string };
  requester: { name: string };
  signer: { name: string };
  document: { title: string; category: Category; fileHash: string };
  issue: { leafIndex: number; signerKeyFingerprint: string; signedAt: string } | null;
}

export const inboxKey = (userId: string) => ["signature-requests", userId] as const;

export function listInbox(userId: string, signal: AbortSignal) {
  return apiRequest<InboxItem[]>("/me/signature-requests", { expectedUserId: userId, signal });
}

export function signRequest(
  id: string,
  userId: string,
  body: { fileHash: string; signerKeyFingerprint: string; signedAt: string; signature: string },
) {
  return apiRequest(`/signature-requests/${encodeURIComponent(id)}/sign`, {
    method: "POST",
    expectedUserId: userId,
    body,
  });
}

export function rejectRequest(id: string, userId: string, reason: string) {
  return apiRequest(`/signature-requests/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    expectedUserId: userId,
    body: { reason },
  });
}
