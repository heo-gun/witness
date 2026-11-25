import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { IssuePayload } from "@tlog/shared";
import type { AuthenticatedUser } from "../auth/session.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { CiphertextCleanup } from "../files/ciphertext-cleanup.service.js";
import type { Prisma } from "../generated/prisma/client.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { LogAppendService } from "../log/log-append.service.js";
import { lockOrganization, lockUsers } from "../members/organization-lock.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PrismaService } from "../prisma/prisma.service.js";
import type { RejectRequestDto, SignRequestDto } from "./dto/decision.dto.js";
import { requireRecentSignature, verifyDocumentSignature } from "./document-signature.js";

const decisionFields = {
  id: true,
  orgId: true,
  signerId: true,
  requesterId: true,
  documentId: true,
  status: true,
  document: {
    select: {
      orgId: true,
      issuerId: true,
      title: true,
      category: true,
      fileHash: true,
      status: true,
    },
  },
  encryptedFile: { select: { deletedAt: true, recipientFingerprint: true } },
} satisfies Prisma.SignatureRequestSelect;
type DecisionRequest = Prisma.SignatureRequestGetPayload<{ select: typeof decisionFields }>;

@Injectable()
export class SignerDecisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly log: LogAppendService,
    private readonly cleanup: CiphertextCleanup,
  ) {}

  async decide(id: string, actor: AuthenticatedUser, input: SignRequestDto | RejectRequestDto) {
    const assigned = {
      id,
      signerId: actor.id,
      org: { memberships: { some: { userId: actor.id, role: "signer" } } },
    } satisfies Prisma.SignatureRequestWhereInput;
    const scope = await this.prisma.signatureRequest.findFirst({
      where: assigned,
      select: { orgId: true },
    });
    if (!scope) throw new NotFoundException("Signature request not found");
    const receipt = await this.prisma.$transaction(
      async (tx) => {
        await lockOrganization(tx, scope.orgId);
        await lockUsers(tx, actor, actor.id);
        const request = await tx.signatureRequest.findFirst({
          where: { ...assigned, orgId: scope.orgId },
          select: decisionFields,
        });
        if (
          !request ||
          request.requesterId === actor.id ||
          request.document.issuerId !== request.requesterId ||
          request.document.orgId !== request.orgId
        )
          throw new NotFoundException("Signature request not found");
        const rejecting = "reason" in input;
        if (
          request.document.status !== "pending" ||
          (request.status !== "pending" && !(rejecting && request.status === "needs_resend"))
        )
          throw new ConflictException("This request cannot be decided in its current state");
        const now = new Date();
        const leafIndex = rejecting
          ? undefined
          : await this.verifyAndAppend(tx, request, input, now);
        await tx.document.update({
          where: { id: request.documentId },
          data: { status: rejecting ? "rejected" : "valid" },
        });
        const decision = await tx.signatureRequest.update({
          where: { id: request.id },
          data: {
            status: rejecting ? "rejected" : "signed",
            decidedAt: now,
            rejectReason: rejecting ? input.reason : null,
          },
          select: { id: true, documentId: true, status: true },
        });
        return { ...decision, leafIndex };
      },
      { isolationLevel: "ReadCommitted" },
    );
    await this.cleanup.afterDecision(receipt.id);
    return receipt;
  }

  private async verifyAndAppend(
    tx: Prisma.TransactionClient,
    request: DecisionRequest,
    input: SignRequestDto,
    now: Date,
  ) {
    const { document, encryptedFile, orgId, documentId, signerId } = request;
    if (!encryptedFile || encryptedFile.deletedAt)
      throw new ConflictException("The encrypted file is unavailable");
    if (document.fileHash !== input.fileHash)
      throw new BadRequestException("File hash differs from the document");
    requireRecentSignature(input.signedAt, now);
    const keys = await tx.memberKey.findMany({
      where: {
        orgId,
        userId: signerId,
        status: "active",
        OR: [
          { purpose: "sign", fingerprint: input.signerKeyFingerprint },
          { purpose: "encrypt", fingerprint: encryptedFile.recipientFingerprint },
        ],
      },
      select: { purpose: true, publicKey: true, fingerprint: true },
    });
    const signing = keys.find((key) => key.purpose === "sign");
    if (!signing || !keys.some((key) => key.purpose === "encrypt"))
      throw new ConflictException("An active signing or recipient key has changed");
    const payload: IssuePayload = {
      action: "ISSUE",
      orgId,
      documentId,
      signerId,
      title: document.title,
      category: document.category,
      fileHash: document.fileHash,
      signerKeyFingerprint: signing.fingerprint,
      signedAt: input.signedAt,
    };
    verifyDocumentSignature(payload, input.signature, signing.publicKey);
    const { leafIndex } = await this.log.append(tx, { payload, signature: input.signature });
    return leafIndex;
  }
}
