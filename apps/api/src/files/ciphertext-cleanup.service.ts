import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PrismaService } from "../prisma/prisma.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { CiphertextStorage } from "./ciphertext-storage.service.js";

const remaining = {
  deletedAt: null,
  request: { status: { in: ["signed", "rejected"] } },
} satisfies Prisma.EncryptedFileWhereInput;

@Injectable()
export class CiphertextCleanup implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CiphertextCleanup.name);
  private timer?: NodeJS.Timeout;
  private retrying = false;

  constructor(
    private readonly db: PrismaService,
    private readonly storage: CiphertextStorage,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.retryPending().catch(() =>
        this.logger.warn("Could not load pending file deletions"),
      );
    }, 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async afterDecision(requestId: string): Promise<void> {
    try {
      const file = await this.db.encryptedFile.findFirst({
        where: { requestId, ...remaining },
        select: { id: true },
      });
      if (!file) return;
      await this.storage.removeRequest(requestId);
      await this.db.encryptedFile.updateMany({
        where: { id: file.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    } catch {
      // The decision was committed. A null deletedAt leaves the ciphertext eligible for retry.
      this.logger.warn("Encrypted file deletion pending");
    }
  }

  async retryPending(): Promise<void> {
    if (this.retrying) return;
    this.retrying = true;
    try {
      let after: string | undefined;
      for (;;) {
        const files = await this.db.encryptedFile.findMany({
          where: { ...remaining, requestId: { gt: after } },
          select: { requestId: true },
          orderBy: { requestId: "asc" },
          take: 25,
        });
        for (const { requestId } of files) await this.afterDecision(requestId);
        if (files.length < 25) return;
        after = files[files.length - 1]?.requestId;
      }
    } finally {
      this.retrying = false;
    }
  }
}
