import { Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PrismaService } from "../prisma/prisma.service.js";

const published = { status: { in: ["valid", "revoked"] } } satisfies Prisma.DocumentWhereInput;
const publicFields = {
  id: true,
  fileHash: true,
  title: true,
  category: true,
  org: { select: { id: true, slug: true, name: true } },
  logEntries: {
    where: { type: { in: ["ISSUE", "REVOKE"] } },
    select: { type: true, leafIndex: true, actor: { select: { id: true, name: true } } },
  },
} satisfies Prisma.DocumentSelect;

function publicDocument({
  logEntries,
  ...document
}: Prisma.DocumentGetPayload<{ select: typeof publicFields }>) {
  const issue = logEntries.find((entry) => entry.type === "ISSUE");
  if (!issue) throw new InternalServerErrorException("Published document has no issue entry");
  const revocation = logEntries.find((entry) => entry.type === "REVOKE");
  return {
    ...document,
    status: revocation ? "revoked" : "valid",
    issue: { leafIndex: issue.leafIndex, signer: issue.actor },
    revocation: revocation ? { leafIndex: revocation.leafIndex, signer: revocation.actor } : null,
  };
}

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async byId(id: string) {
    const document = await this.prisma.document.findFirst({
      where: { ...published, id },
      select: publicFields,
    });
    if (!document) throw new NotFoundException("Document not found");
    return publicDocument(document);
  }

  async list(filter: { fileHash: string } | { org: { slug: string } }) {
    const documents = await this.prisma.document.findMany({
      where: { ...published, ...filter },
      select: publicFields,
      orderBy: { id: "desc" },
    });
    return documents.map(publicDocument);
  }
}
