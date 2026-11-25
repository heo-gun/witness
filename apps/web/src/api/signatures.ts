import type { Category } from "@tlog/shared";
import type { EncryptedTransfer } from "@/lib/crypto/transfer";
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
  signerId: string;
  status: RequestStatus;
}

const filePath = (requestId: string) =>
  `/api/v1/signature-requests/${encodeURIComponent(requestId)}/file`;

export async function downloadEncryptedFile(
  requestId: string,
  expectedUserId: string,
  signal?: AbortSignal,
): Promise<EncryptedTransfer> {
  const timeout = AbortSignal.timeout(120_000);
  const response = await fetch(filePath(requestId), {
    credentials: "same-origin",
    cache: "no-store",
    headers: { "X-Expected-User-Id": expectedUserId },
    signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
  });
  if (!response.ok) throw new ApiError(response.status);
  const ephemeralPublicKey = response.headers.get("X-Ephemeral-Public-Key");
  const iv = response.headers.get("X-IV");
  const recipientFingerprint = response.headers.get("X-Recipient-Fingerprint");
  if (!ephemeralPublicKey || !iv || !recipientFingerprint) throw new ApiError(502);
  return { ciphertext: await response.arrayBuffer(), ephemeralPublicKey, iv, recipientFingerprint };
}

export async function uploadEncryptedFile(
  request: RequestReference,
  file: EncryptedTransfer,
  expectedUserId: string,
): Promise<RequestReference> {
  const response = await fetch(filePath(request.id), {
    method: "PUT",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Expected-User-Id": expectedUserId,
      "X-Ephemeral-Public-Key": file.ephemeralPublicKey,
      "X-IV": file.iv,
      "X-Recipient-Fingerprint": file.recipientFingerprint,
    },
    body: file.ciphertext,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new ApiError(response.status);
  const receipt = (await response.json()) as Pick<RequestReference, "id" | "documentId" | "status">;
  if (
    receipt.id !== request.id ||
    receipt.documentId !== request.documentId ||
    receipt.status !== "pending"
  ) {
    throw new ApiError(502);
  }
  return { ...request, status: receipt.status };
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
