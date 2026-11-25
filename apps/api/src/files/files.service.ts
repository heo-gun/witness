import { createHash, randomUUID } from "node:crypto";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/session.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { lockOrganization, lockUsers } from "../members/organization-lock.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PrismaService } from "../prisma/prisma.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { CiphertextStorage } from "./ciphertext-storage.service.js";

interface Envelope {
  ephemeralPublicKey: string;
  iv: string;
  recipientFingerprint: string;
}

async function findRequest(
  db: Prisma.TransactionClient,
  id: string,
  userId: string,
  role: "issuer" | "signer",
) {
  const request = await db.signatureRequest.findFirst({
    where: {
      id,
      ...(role === "issuer" ? { requesterId: userId } : { signerId: userId }),
      org: { memberships: { some: { userId, role } } },
    },
    select: {
      id: true,
      orgId: true,
      documentId: true,
      signerId: true,
      status: true,
      encryptedFile: true,
    },
  });
  if (!request) throw new NotFoundException("Signature request not found");
  return request;
}
type FileRequest = Awaited<ReturnType<typeof findRequest>>;

async function requireActiveRecipient(
  db: Prisma.TransactionClient,
  request: FileRequest,
  fingerprint: string,
) {
  const key = await db.memberKey.findFirst({
    where: {
      userId: request.signerId,
      orgId: request.orgId,
      fingerprint,
      purpose: "encrypt",
      status: "active",
      user: {
        emailVerifiedAt: { not: null },
        memberships: { some: { orgId: request.orgId, role: "signer" } },
      },
    },
    select: { id: true },
  });
  if (!key) throw new ConflictException("The recipient encryption key has changed");
}

@Injectable()
export class FilesService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: CiphertextStorage,
  ) {}

  private withRequest<T>(
    scope: FileRequest,
    actor: AuthenticatedUser,
    role: "issuer" | "signer",
    fn: (tx: Prisma.TransactionClient, current: FileRequest) => Promise<T>,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await lockOrganization(tx, scope.orgId);
        await lockUsers(tx, actor, scope.signerId);
        return fn(tx, await findRequest(tx, scope.id, actor.id, role));
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  async upload(
    id: string,
    actor: AuthenticatedUser,
    envelope: Envelope,
    readBody: () => Promise<Buffer>,
  ) {
    const scope = await findRequest(this.db, id, actor.id, "issuer");
    if (scope.status === "signed" || scope.status === "rejected")
      throw new ConflictException("This request has been decided");
    await requireActiveRecipient(this.db, scope, envelope.recipientFingerprint);
    const bytes = await readBody();
    const digest = createHash("sha256").update(bytes).digest("hex");
    const result = { id, documentId: scope.documentId, status: "pending" as const };

    // Reserve the object in the DB first. An interrupted PUT stays discoverable for a retry.
    const reservation = await this.withRequest(scope, actor, "issuer", async (tx, current) => {
      await requireActiveRecipient(tx, current, envelope.recipientFingerprint);
      const previous = current.encryptedFile;
      const same =
        previous &&
        !previous.deletedAt &&
        previous.storageKey.endsWith("/" + digest) &&
        previous.ephemeralPublicKey === envelope.ephemeralPublicKey &&
        previous.iv === envelope.iv &&
        previous.recipientFingerprint === envelope.recipientFingerprint;
      if (current.status === "pending" && same) return null;
      if (current.status !== "awaiting_upload" && current.status !== "needs_resend")
        throw new ConflictException("The request no longer accepts this upload");
      if (same) return { key: previous.storageKey, replaced: null };
      const storageKey = `files/${id}/${randomUUID()}/${digest}`;
      const data = { ...envelope, size: bytes.length, storageKey, deletedAt: null };
      await tx.encryptedFile.upsert({
        where: { requestId: id },
        create: { requestId: id, ...data },
        update: data,
      });
      return {
        key: storageKey,
        replaced: previous && !previous.deletedAt ? previous.storageKey : null,
      };
    });
    if (reservation === null) return result;

    try {
      // Remove only after the new reservation commits. A delayed DELETE must never hit a live key.
      if (reservation.replaced) await this.storage.remove(reservation.replaced);
      await this.storage.put(reservation.key, bytes);
      await this.withRequest(scope, actor, "issuer", async (tx, current) => {
        if (
          current.encryptedFile?.storageKey !== reservation.key ||
          current.encryptedFile.deletedAt
        )
          throw new ConflictException("This upload has been replaced");
        await requireActiveRecipient(tx, current, envelope.recipientFingerprint);
        if (current.status === "pending") return;
        if (current.status !== "awaiting_upload" && current.status !== "needs_resend")
          throw new ConflictException("The request no longer accepts uploads");
        await tx.signatureRequest.update({ where: { id }, data: { status: "pending" } });
      });
    } catch (error) {
      // A late PUT may recreate the object while decision cleanup is still marking it deleted.
      const current = await this.db.encryptedFile.findUnique({
        where: { requestId: id },
        select: { storageKey: true, deletedAt: true, request: { select: { status: true } } },
      });
      if (
        current?.storageKey !== reservation.key ||
        current.deletedAt ||
        current.request.status === "signed" ||
        current.request.status === "rejected"
      )
        await this.storage.remove(reservation.key);
      throw error;
    }
    return result;
  }

  async download(id: string, actor: AuthenticatedUser) {
    const scope = await findRequest(this.db, id, actor.id, "signer");
    const file = scope.encryptedFile;
    if (scope.status !== "pending" || !file || file.deletedAt)
      throw new ConflictException("The file is not available for signing");
    await requireActiveRecipient(this.db, scope, file.recipientFingerprint);
    const bytes = await this.storage.get(file.storageKey);
    await this.withRequest(scope, actor, "signer", async (tx, current) => {
      if (
        current.status !== "pending" ||
        current.encryptedFile?.storageKey !== file.storageKey ||
        current.encryptedFile.deletedAt
      )
        throw new ConflictException("The file is no longer available for signing");
      await requireActiveRecipient(tx, current, file.recipientFingerprint);
    });
    return { file, bytes };
  }
}
