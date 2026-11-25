import type { Category } from "@tlog/shared";
import { apiRequest, ApiError } from "./client";

export interface RequestInput {
  title: string;
  category: Category;
  fileHash: string;
  signerId: string;
}

export type RequestStatus = "awaiting_upload" | "pending" | "needs_resend" | "signed" | "rejected";
export interface RequestReference {
  id: string;
  documentId: string;
  status: RequestStatus;
}

export function createSignatureRequest(slug: string, body: RequestInput, expectedUserId: string) {
  return apiRequest<RequestReference>(`/orgs/${encodeURIComponent(slug)}/signature-requests`, {
    method: "POST",
    body,
    expectedUserId,
  });
}

export function existingRequest(error: unknown): RequestReference | undefined {
  if (!(error instanceof ApiError) || error.status !== 409) return;
  // The API includes this reference only if the current issuer owns the request.
  const body = error.body as { existing?: RequestReference } | undefined;
  return body?.existing;
}
