import { Injectable } from "@nestjs/common";
import type { SignedEntry } from "@tlog/shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class InboxService {
  constructor(private readonly db: PrismaService) {}

  async list(userId: string) {
    const rows = await this.db.signatureRequest.findMany({
      where: {
        signerId: userId,
        status: { not: "awaiting_upload" },
        org: { memberships: { some: { userId, role: "signer" } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        orgId: true,
        documentId: true,
        requesterId: true,
        signerId: true,
        status: true,
        createdAt: true,
        decidedAt: true,
        rejectReason: true,
        org: { select: { name: true, slug: true } },
        requester: { select: { name: true } },
        signer: { select: { name: true } },
        document: {
          select: {
            title: true,
            category: true,
            fileHash: true,
            logEntries: {
              where: { type: "ISSUE" },
              select: { leafIndex: true, entryBytes: true },
              take: 1,
            },
          },
        },
      },
    });
    return rows.map(({ document: { logEntries, ...document }, ...request }) => {
      const entry = logEntries[0];
      if (!entry) return { ...request, document, issue: null };
      const { payload } = JSON.parse(Buffer.from(entry.entryBytes).toString("utf8")) as SignedEntry;
      return {
        ...request,
        document,
        issue: {
          leafIndex: entry.leafIndex,
          signerKeyFingerprint: payload.signerKeyFingerprint,
          signedAt: payload.signedAt,
        },
      };
    });
  }
}
