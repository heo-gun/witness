import type { Category, RevokePayload } from "@tlog/shared";
import { apiRequest } from "./client";

interface PublicDecision {
  leafIndex: number;
  signer: { id: string; name: string };
}

export interface PublicDocument {
  id: string;
  fileHash: string;
  title: string;
  category: Category;
  status: "valid" | "revoked";
  org: { id: string; slug: string; name: string };
  issue: PublicDecision;
  revocation: PublicDecision | null;
}

export function verifyByHash(hash: string, signal?: AbortSignal) {
  return apiRequest<PublicDocument[]>(`/verify?hash=${encodeURIComponent(hash)}`, { signal });
}

export function getDocument(id: string, signal?: AbortSignal) {
  return apiRequest<PublicDocument>(`/documents/${encodeURIComponent(id)}`, { signal });
}

export function listDocuments(slug: string, signal?: AbortSignal) {
  return apiRequest<PublicDocument[]>(`/orgs/${encodeURIComponent(slug)}/documents`, { signal });
}

type RevokeInput = Pick<
  RevokePayload,
  "targetLeafIndex" | "reason" | "signedAt" | "signerKeyFingerprint"
> & {
  signature: string;
};

export function revokeDocument(id: string, input: RevokeInput, expectedUserId: string) {
  return apiRequest<{ documentId: string; leafIndex: number }>(
    `/documents/${encodeURIComponent(id)}/revoke`,
    {
      method: "POST",
      body: input,
      expectedUserId,
    },
  );
}
