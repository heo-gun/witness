import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, randomUUID, verify } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { leafHash, verifyConsistency, verifyInclusion } from "@tlog/merkle";
import { canonicalBytes, hexToBytes, type KeyRegisterEntry, type SthPayload } from "@tlog/shared";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { LogAppendService } from "../src/log/log-append.service.js";
import { configureApp } from "../src/main.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

type Head = SthPayload & { signature: string };

describe("signed log on MySQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let writer: LogAppendService;
  let orgId: string;
  let ownerId: string;
  let initialSize: number;
  const entries: KeyRegisterEntry[] = [];
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const priorKey = process.env.LOG_SIGNING_KEY;
  const get = (path: string) => request(app.getHttpServer()).get("/api/v1/log" + path);

  beforeAll(async () => {
    process.env.LOG_SIGNING_KEY = privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    writer = app.get(LogAppendService);
    initialSize = (await prisma.logState.findUniqueOrThrow({ where: { id: 1 } })).treeSize;
    const slug = "logtest-" + randomUUID();
    const org = await prisma.organization.create({ data: { slug, name: "Log e2e" } });
    orgId = org.id;
    const owner = await prisma.user.create({
      data: { email: slug + "@example.com", name: "owner", passwordHash: "fixture" },
    });
    ownerId = owner.id;
    for (let i = 0; i < 20; i++) {
      const publicBytes = randomBytes(32);
      const key = await prisma.memberKey.create({
        data: {
          user: {
            create: { email: `${slug}-${i}@example.com`, name: "signer", passwordHash: "fixture" },
          },
          org: { connect: { id: orgId } },
          purpose: "sign",
          publicKey: publicBytes.toString("hex"),
          fingerprint: createHash("sha256").update(publicBytes).digest("hex"),
        },
      });
      entries.push({
        type: "KEY_REGISTER",
        orgId,
        userId: key.userId,
        purpose: "sign",
        publicKey: key.publicKey,
        fingerprint: key.fingerprint,
        approvedBy: ownerId,
        approvedAt: new Date().toISOString(),
      });
    }
  });

  afterAll(async () => {
    if (priorKey === undefined) delete process.env.LOG_SIGNING_KEY;
    else process.env.LOG_SIGNING_KEY = priorKey;
    await app?.close();
  });

  it("commits 20 parallel appends with consecutive indices and verifiable public heads and proofs", async () => {
    const writes = await Promise.all(
      entries.map((entry) =>
        prisma.$transaction(
          async (tx) => {
            await tx.memberKey.update({
              where: { fingerprint: entry.fingerprint },
              data: { status: "active" },
            });
            // Open a snapshot before contending for the log lock.
            await tx.logState.findUniqueOrThrow({ where: { id: 1 } });
            const result = await writer.append(tx, entry);
            return { ...result, entry };
          },
          { isolationLevel: "RepeatableRead", maxWait: 15000, timeout: 15000 },
        ),
      ),
    );
    writes.sort((a, b) => a.leafIndex - b.leafIndex);
    expect(writes.map((w) => w.leafIndex)).toEqual(entries.map((_, i) => initialSize + i));
    const size = initialSize + writes.length;
    const history = (await get("/sth/history").expect(200)).body as Head[];
    const published = history.slice(0, writes.length).reverse();
    expect(published).toEqual(writes.map((w) => w.treeHead));
    for (const { signature, ...payload } of published) {
      expect(verify(null, canonicalBytes(payload), publicKey, Buffer.from(signature, "hex"))).toBe(
        true,
      );
    }
    const head = (await get("/sth").expect(200)).body as Head;
    expect(head).toEqual(published.at(-1));
    const rows = (await get(`/entries?start=${initialSize}&end=${size - 1}`).expect(200)).body as {
      entryJson: string;
      leafHash: string;
      leafIndex: number;
    }[];
    expect(rows).toHaveLength(writes.length);
    const root = hexToBytes(head.rootHash);
    for (const [i, row] of rows.entries()) {
      const write = writes[i];
      assert(write);
      const { entry, leafIndex } = write;
      const bytes = canonicalBytes(entry);
      expect(row.entryJson).toBe(Buffer.from(bytes).toString("utf8"));
      expect(row.leafIndex).toBe(leafIndex);
      const hash = leafHash(bytes);
      expect(hexToBytes(row.leafHash)).toEqual(hash);
      const { auditPath } = (
        await get(`/proof/inclusion?leafIndex=${leafIndex}&treeSize=${size}`).expect(200)
      ).body as { auditPath: string[] };
      expect(
        verifyInclusion({
          leafIndex,
          treeSize: size,
          leafHash: hash,
          rootHash: root,
          proof: auditPath.map((h) => hexToBytes(h)),
        }),
      ).toBe(true);
    }
    const first = published[0];
    assert(first);
    const { proof } = (
      await get(`/proof/consistency?first=${first.treeSize}&second=${size}`).expect(200)
    ).body as { proof: string[] };
    expect(
      verifyConsistency({
        firstSize: first.treeSize,
        secondSize: size,
        firstRoot: hexToBytes(first.rootHash),
        secondRoot: root,
        proof: proof.map((h) => hexToBytes(h)),
      }),
    ).toBe(true);
    expect(await prisma.memberKey.count({ where: { orgId, status: "active" } })).toBe(
      entries.length,
    );
  }, 30000);

  it("rolls back the domain change, entry, head and index when the caller fails", async () => {
    const before = (await prisma.logState.findUniqueOrThrow({ where: { id: 1 } })).treeSize;
    const key = await prisma.memberKey.findFirstOrThrow({ where: { orgId } });
    const { fingerprint } = key;
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.memberKey.update({ where: { fingerprint }, data: { status: "revoked" } });
        await writer.append(tx, {
          type: "KEY_REVOKE",
          orgId,
          fingerprint,
          revokedBy: ownerId,
          revokedAt: new Date().toISOString(),
          reason: "e2e",
        });
        throw new Error("domain operation failed");
      }),
    ).rejects.toThrow("domain operation failed");
    expect(await prisma.logState.findUnique({ where: { id: 1 } })).toMatchObject({
      treeSize: before,
    });
    expect(await prisma.logEntry.findUnique({ where: { leafIndex: before } })).toBeNull();
    expect(await prisma.treeHead.findUnique({ where: { treeSize: before + 1 } })).toBeNull();
    expect(await prisma.memberKey.findUnique({ where: { fingerprint } })).toMatchObject({
      status: key.status,
    });
  });
});
