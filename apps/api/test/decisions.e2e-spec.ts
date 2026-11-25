import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
  verify,
} from "node:crypto";
import { ServiceUnavailableException, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { leafHash, verifyInclusion } from "@tlog/merkle";
import { canonicalBytes, hexToBytes, type IssuePayload, type SthPayload } from "@tlog/shared";
import http from "supertest";
import { AppModule } from "../src/app.module.js";
import { SESSION_COOKIE } from "../src/auth/session.config.js";
import { SessionService } from "../src/auth/session.service.js";
import { CiphertextStorage } from "../src/files/ciphertext-storage.service.js";
import { CiphertextCleanup } from "../src/files/ciphertext-cleanup.service.js";
import type { Role, SignatureRequestStatus } from "../src/generated/prisma/client.js";
import { LogAppendService } from "../src/log/log-append.service.js";
import { configureApp } from "../src/main.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

type Actor = { id: string; cookie: string };
type Target = { id: string; documentId: string; fileHash: string };
const randomHex = (n: number) => randomBytes(n).toString("hex");
const title = '회의록 "승인"';

describe("signer decisions (e2e)", () => {
  let app: INestApplication, db: PrismaService;
  let orgId: string, signer: Actor, issuer: Actor, other: Actor, unverified: Actor;
  let fingerprint: string, encryptionFingerprint: string;
  const slug = "decisions-" + randomUUID();
  const signerKeys = generateKeyPairSync("ed25519");
  const logKeys = generateKeyPairSync("ed25519");
  const oldLogKey = process.env.LOG_SIGNING_KEY;
  const storage = {
    put: jest.fn<Promise<void>, [string, Buffer]>().mockResolvedValue(undefined),
    removeRequest: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
  };
  async function actor(role: Role, verified = true): Promise<Actor> {
    const user = await db.user.create({
      data: {
        name: role,
        email: randomUUID() + "@example.test",
        passwordHash: "fixture",
        emailVerifiedAt: verified ? new Date() : null,
        memberships: { create: { orgId, role } },
      },
    });
    return {
      id: user.id,
      cookie:
        SESSION_COOKIE + "=" + (await app.get(SessionService).issue(user.id, user.tokenVersion)),
    };
  }
  async function fixture(
    status: SignatureRequestStatus = "pending",
    assigned = signer,
  ): Promise<Target> {
    const fileHash = randomHex(32);
    const doc = await db.document.create({
      data: {
        title,
        fileHash,
        category: "agenda",
        orgId,
        issuerId: issuer.id,
        signatureRequest: {
          create: {
            orgId,
            requesterId: issuer.id,
            signerId: assigned.id,
            status,
            encryptedFile: {
              create: {
                storageKey: randomUUID(),
                size: 32,
                ephemeralPublicKey: randomHex(32),
                iv: randomHex(12),
                recipientFingerprint: encryptionFingerprint,
              },
            },
          },
        },
      },
      include: { signatureRequest: true },
    });
    assert(doc.signatureRequest);
    return { id: doc.signatureRequest.id, documentId: doc.id, fileHash };
  }
  function signed(
    target: Target,
    fields: Partial<IssuePayload> = {},
    privateKey = signerKeys.privateKey,
  ) {
    const payload: IssuePayload = {
      action: "ISSUE",
      orgId,
      documentId: target.documentId,
      title,
      category: "agenda",
      signerId: signer.id,
      fileHash: target.fileHash,
      signerKeyFingerprint: fingerprint,
      signedAt: new Date().toISOString(),
      ...fields,
    };
    const { fileHash, signerKeyFingerprint, signedAt } = payload;
    const signature = sign(null, canonicalBytes(payload), privateKey).toString("hex");
    return { payload, body: { fileHash, signerKeyFingerprint, signedAt, signature } };
  }
  const post = (id: string, action: "sign" | "reject", body: object, who = signer) =>
    http(app.getHttpServer())
      .post(`/api/v1/signature-requests/${id}/${action}`)
      .set("Cookie", who.cookie)
      .send(body);
  const inbox = (who: Actor) =>
    http(app.getHttpServer()).get("/api/v1/me/signature-requests").set("Cookie", who.cookie);
  const state = (id: string) =>
    db.signatureRequest.findUniqueOrThrow({
      where: { id },
      include: { document: true, encryptedFile: true },
    });
  const treeSize = async () => (await db.logState.findUniqueOrThrow({ where: { id: 1 } })).treeSize;
  beforeAll(async () => {
    process.env.LOG_SIGNING_KEY = logKeys.privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64");
    const ref = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CiphertextStorage)
      .useValue(storage)
      .compile();
    app = ref.createNestApplication();
    configureApp(app);
    await app.listen(0, "127.0.0.1");
    db = app.get(PrismaService);
    orgId = (await db.organization.create({ data: { slug, name: "의결 테스트" } })).id;
    [signer, issuer, other, unverified] = await Promise.all([
      actor("signer"),
      actor("issuer"),
      actor("signer"),
      actor("signer", false),
    ]);
    const raw = signerKeys.publicKey.export({ format: "jwk" }).x;
    assert(raw);
    const publicKey = Buffer.from(raw, "base64url");
    fingerprint = createHash("sha256").update(publicKey).digest("hex");
    encryptionFingerprint = randomHex(32);
    await db.memberKey.createMany({
      data: [
        {
          userId: signer.id,
          orgId,
          purpose: "sign",
          status: "active",
          publicKey: publicKey.toString("hex"),
          fingerprint,
        },
        {
          userId: signer.id,
          orgId,
          purpose: "encrypt",
          status: "active",
          publicKey: randomHex(32),
          fingerprint: encryptionFingerprint,
        },
      ],
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    storage.removeRequest.mockReset().mockResolvedValue(undefined);
  });
  afterAll(async () => {
    if (oldLogKey === undefined) delete process.env.LOG_SIGNING_KEY;
    else process.env.LOG_SIGNING_KEY = oldLogKey;
    await app?.close();
  });

  it("creates, uploads, signs and verifies the published issue bytes, signed head and inclusion proof", async () => {
    const fileHash = randomHex(32);
    const created = await http(app.getHttpServer())
      .post(`/api/v1/orgs/${slug}/signature-requests`)
      .set("Cookie", issuer.cookie)
      .send({ title, category: "agenda", fileHash, signerId: signer.id })
      .expect(201);
    const { id, documentId } = created.body as Target;
    await http(app.getHttpServer())
      .put(`/api/v1/signature-requests/${id}/file`)
      .set("Cookie", issuer.cookie)
      .set("Content-Type", "application/octet-stream")
      .set("X-IV", randomHex(12))
      .set("X-Ephemeral-Public-Key", randomHex(32))
      .set("X-Recipient-Fingerprint", encryptionFingerprint)
      .send(randomBytes(40))
      .expect(200);
    const { body, payload } = signed({ id, documentId, fileHash });
    let stateAtCleanup: string | undefined;
    storage.removeRequest.mockImplementationOnce(async (requestId) => {
      stateAtCleanup = (await state(requestId)).status;
    });
    const response = await post(id, "sign", body).expect(200);
    expect(response.body).toMatchObject({ id, documentId, status: "signed" });
    expect(stateAtCleanup).toBe("signed");
    expect(await state(id)).toMatchObject({
      status: "signed",
      decidedAt: expect.any(Date),
      document: { status: "valid" },
      encryptedFile: { deletedAt: expect.any(Date) },
    });
    const row = await db.logEntry.findFirstOrThrow({ where: { orgId, documentId, type: "ISSUE" } });
    expect(response.body.leafIndex).toBe(row.leafIndex);
    const entry = canonicalBytes({ payload, signature: body.signature });
    expect(Buffer.from(row.entryBytes)).toEqual(Buffer.from(entry));
    expect(
      verify(
        null,
        canonicalBytes(payload),
        signerKeys.publicKey,
        Buffer.from(body.signature, "hex"),
      ),
    ).toBe(true);
    const get = (path: string) => http(app.getHttpServer()).get("/api/v1/log" + path);
    const { signature, ...head } = (await get("/sth").expect(200)).body as SthPayload & {
      signature: string;
    };
    expect(
      verify(null, canonicalBytes(head), logKeys.publicKey, Buffer.from(signature, "hex")),
    ).toBe(true);
    const { auditPath } = (
      await get(`/proof/inclusion?leafIndex=${row.leafIndex}&treeSize=${head.treeSize}`).expect(200)
    ).body as { auditPath: string[] };
    expect(
      verifyInclusion({
        leafIndex: row.leafIndex,
        treeSize: head.treeSize,
        rootHash: hexToBytes(head.rootHash),
        leafHash: leafHash(entry),
        proof: auditPath.map((h) => hexToBytes(h)),
      }),
    ).toBe(true);
    expect((await inbox(signer).expect(200)).body).toContainEqual(
      expect.objectContaining({
        id,
        status: "signed",
        issue: {
          leafIndex: row.leafIndex,
          signedAt: body.signedAt,
          signerKeyFingerprint: fingerprint,
        },
      }),
    );
  });
  it("exposes only delivered requests assigned to the verified signer", async () => {
    const [pending, waiting, unrelated] = await Promise.all([
      fixture(),
      fixture("awaiting_upload"),
      fixture("pending", other),
    ]);
    await http(app.getHttpServer()).get("/api/v1/me/signature-requests").expect(401);
    await inbox(unverified).expect(403);
    const found = await inbox(signer).expect(200);
    expect(found.body).toContainEqual(
      expect.objectContaining({
        id: pending.id,
        status: "pending",
        document: expect.objectContaining({ fileHash: pending.fileHash }),
        issue: null,
      }),
    );
    expect(found.text).not.toContain(waiting.id);
    expect(found.text).not.toContain(unrelated.id);
    expect(found.text).not.toContain("storageKey");
    expect((await inbox(issuer).expect(200)).body).toEqual([]);
    const input = signed(pending).body;
    await post(pending.id, "sign", input, other).expect(404);
    await post(pending.id, "reject", { reason: "오류" }, issuer).expect(404);
    await post(pending.id, "sign", input, unverified).expect(403);
    await post(pending.id, "sign", input).set("X-Expected-User-Id", other.id).expect(412);
    await post(waiting.id, "sign", signed(waiting).body).expect(409);
    await post(waiting.id, "reject", { reason: "대기" }).expect(409);
    expect(storage.removeRequest).not.toHaveBeenCalled();
  });
  it.each(["session", "role"] as const)(
    "rechecks the signer's %s after authentication",
    async (change) => {
      const who = await actor("signer");
      const target = await fixture("pending", who);
      const sessions = app.get(SessionService);
      const authenticate = sessions.authenticate.bind(sessions);
      jest.spyOn(sessions, "authenticate").mockImplementationOnce(async (token) => {
        const validated = await authenticate(token);
        if (change === "session") {
          await db.user.update({ where: { id: who.id }, data: { tokenVersion: { increment: 1 } } });
        } else {
          await db.membership.update({
            where: { userId_orgId: { userId: who.id, orgId } },
            data: { role: "issuer" },
          });
        }
        return validated;
      });
      await post(target.id, "reject", { reason: "수정 요청" }, who).expect(
        change === "session" ? 401 : 404,
      );
      expect((await state(target.id)).status).toBe("pending");
      expect(storage.removeRequest).not.toHaveBeenCalled();
    },
  );
  it("refuses changed fields, other-key signatures, noncanonical time and stale or revoked keys", async () => {
    const target = await fixture();
    for (const body of [
      signed(target, { title: "의결 제목 변경" }).body,
      signed(target, { fileHash: randomHex(32) }).body,
      signed(target, {}, generateKeyPairSync("ed25519").privateKey).body,
      signed(target, { signedAt: new Date(Date.now() - 301_000).toISOString() }).body,
      signed(target, { signedAt: new Date(Date.now() + 301_000).toISOString() }).body,
      { ...signed(target).body, signedAt: "yesterday" },
      { ...signed(target).body, signature: "ab" },
      { ...signed(target).body, title: "unexpected" },
    ])
      await post(target.id, "sign", body).expect(400);
    await post(
      target.id,
      "sign",
      signed(target, { signerKeyFingerprint: encryptionFingerprint }).body,
    ).expect(409);
    for (const revoked of [fingerprint, encryptionFingerprint]) {
      await db.memberKey.update({ where: { fingerprint: revoked }, data: { status: "revoked" } });
      try {
        await post(target.id, "sign", signed(target).body).expect(409);
      } finally {
        await db.memberKey.update({ where: { fingerprint: revoked }, data: { status: "active" } });
      }
    }
    expect(await state(target.id)).toMatchObject({
      status: "pending",
      document: { status: "pending" },
      encryptedFile: { deletedAt: null },
    });
    expect(await db.logEntry.count({ where: { documentId: target.documentId } })).toBe(0);
    expect(storage.removeRequest).not.toHaveBeenCalled();
  });
  it("rolls back a signed decision, its STH and the leaf counter together before touching storage", async () => {
    const target = await fixture(),
      before = await treeSize();
    const log = app.get(LogAppendService),
      append = log.append.bind(log);
    jest.spyOn(log, "append").mockImplementationOnce(async (tx, entry) => {
      await append(tx, entry);
      throw new ServiceUnavailableException("test failure after writing head");
    });
    await post(target.id, "sign", signed(target).body).expect(503);
    expect(await treeSize()).toBe(before);
    expect(await db.treeHead.findUnique({ where: { treeSize: before + 1 } })).toBeNull();
    expect(await db.logEntry.count({ where: { documentId: target.documentId } })).toBe(0);
    expect(await state(target.id)).toMatchObject({
      status: "pending",
      decidedAt: null,
      document: { status: "pending" },
      encryptedFile: { deletedAt: null },
    });
    expect(storage.removeRequest).not.toHaveBeenCalled();
    await post(target.id, "sign", signed(target).body).expect(200);
  });
  it("keeps the rejection reason without a log and queues failed ciphertext cleanup for retry", async () => {
    const target = await fixture("needs_resend"),
      before = await treeSize();
    await post(target.id, "reject", { reason: " " }).expect(400);
    await post(target.id, "reject", { reason: "가".repeat(501) }).expect(400);
    storage.removeRequest.mockRejectedValueOnce(new Error("test store unavailable"));
    await post(target.id, "reject", { reason: "첨부 자료 누락" }).expect(200);
    expect(await state(target.id)).toMatchObject({
      status: "rejected",
      rejectReason: "첨부 자료 누락",
      document: { status: "rejected" },
      encryptedFile: { deletedAt: null },
    });
    expect(await treeSize()).toBe(before);
    expect(await db.logEntry.count({ where: { documentId: target.documentId } })).toBe(0);
    await post(target.id, "sign", signed(target).body).expect(409);
    expect((await inbox(signer).expect(200)).body).toContainEqual(
      expect.objectContaining({ id: target.id, rejectReason: "첨부 자료 누락", issue: null }),
    );
    await app.get(CiphertextCleanup).retryPending();
    expect((await state(target.id)).encryptedFile?.deletedAt).toEqual(expect.any(Date));
    expect(storage.removeRequest.mock.calls.filter(([id]) => id === target.id)).toHaveLength(2);
  });
  it("permits one final decision when sign and reject arrive together", async () => {
    const target = await fixture();
    const [a, b] = await Promise.all([
      post(target.id, "sign", signed(target).body),
      post(target.id, "reject", { reason: "반려" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const won = a.status === 200;
    expect(await state(target.id)).toMatchObject({
      status: won ? "signed" : "rejected",
      document: { status: won ? "valid" : "rejected" },
    });
    expect(await db.logEntry.count({ where: { documentId: target.documentId } })).toBe(won ? 1 : 0);
  });
  it("records twenty concurrent signatures in distinct consecutive leaves", async () => {
    const targets = await Promise.all(Array.from({ length: 20 }, () => fixture()));
    const before = await treeSize();
    const results = await Promise.all(
      targets.map((target) => post(target.id, "sign", signed(target).body)),
    );
    expect(results.map((result) => result.status)).toEqual(Array(20).fill(200));
    const entries = await db.logEntry.findMany({
      where: { documentId: { in: targets.map((r) => r.documentId) } },
      orderBy: { leafIndex: "asc" },
    });
    expect(entries.map((row) => row.leafIndex)).toEqual(targets.map((_, i) => before + i));
    expect(await db.treeHead.count({ where: { treeSize: { gt: before, lte: before + 20 } } })).toBe(
      20,
    );
  }, 30_000);
});
