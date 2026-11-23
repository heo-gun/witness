import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { createConsistencyProof, createInclusionProof } from "@tlog/merkle";
import { bytesToHex, hexToBytes } from "@tlog/shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PrismaService } from "../prisma/prisma.service.js";

const PAGE_SIZE = 100;
const PUBLIC_HEAD = { treeSize: true, timestamp: true, rootHash: true, signature: true } as const;

@Injectable()
export class LogReadService {
  constructor(private readonly prisma: PrismaService) {}

  latest() {
    return this.prisma.treeHead.findFirst({ select: PUBLIC_HEAD, orderBy: { treeSize: "desc" } });
  }

  history(before?: number) {
    return this.prisma.treeHead.findMany({
      where: before === undefined ? {} : { treeSize: { lt: before } },
      select: PUBLIC_HEAD,
      orderBy: { treeSize: "desc" },
      take: PAGE_SIZE,
    });
  }

  async entries(start = 0, end?: number) {
    if (end !== undefined && (end < start || end - start >= PAGE_SIZE)) {
      throw new BadRequestException("Expected an inclusive range of 1 to 100 entries");
    }
    const rows = await this.prisma.logEntry.findMany({
      where: { leafIndex: { gte: start, lte: end } },
      select: { leafIndex: true, type: true, leafHash: true, documentId: true, entryBytes: true },
      orderBy: { leafIndex: "asc" },
      take: PAGE_SIZE,
    });
    return rows.map(({ entryBytes, ...entry }) => ({
      ...entry,
      entryJson: Buffer.from(entryBytes).toString("utf8"),
    }));
  }

  async inclusion(leafIndex: number, treeSize: number) {
    if (leafIndex >= treeSize) throw new BadRequestException("Leaf index must be below tree size");
    await this.requireHeads([treeSize]);
    const hashes = await this.leafHashes(treeSize);
    return {
      leafIndex,
      treeSize,
      auditPath: createInclusionProof(hashes, leafIndex).map(bytesToHex),
    };
  }

  async consistency(first: number, second: number) {
    if (first > second) throw new BadRequestException("First tree size exceeds second tree size");
    if (first === second) {
      await this.requireHeads([first]);
      return { first, second, proof: [] };
    }
    await this.requireHeads([first, second]);
    const hashes = await this.leafHashes(second);
    return { first, second, proof: createConsistencyProof(hashes, first).map(bytesToHex) };
  }

  private async requireHeads(sizes: number[]) {
    const count = await this.prisma.treeHead.count({ where: { treeSize: { in: sizes } } });
    if (count !== sizes.length) throw new NotFoundException("Signed tree head not found");
  }

  private async leafHashes(treeSize: number) {
    const rows = await this.prisma.logEntry.findMany({
      where: { leafIndex: { gte: 0, lt: treeSize } },
      orderBy: { leafIndex: "asc" },
      select: { leafHash: true },
    });
    if (rows.length !== treeSize) throw new InternalServerErrorException("Incomplete log history");
    return rows.map(({ leafHash }) => hexToBytes(leafHash, 32));
  }
}
