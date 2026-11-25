import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { ServiceUnavailableException, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { canonicalBytes, type IssuePayload, type RevokePayload } from "@tlog/shared";
import http from "supertest";
import { AppModule } from "../src/app.module.js";
import { SESSION_COOKIE } from "../src/auth/session.config.js";
import { SessionService } from "../src/auth/session.service.js";
import type { Role } from "../src/generated/prisma/client.js";
import { LogAppendService } from "../src/log/log-append.service.js";
import { configureApp } from "../src/main.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

describe("public documents and signed revocation (e2e)", () => {
  let app: INestApplication, db: PrismaService, log: LogAppendService;
  let orgId: string, otherOrgId: string;
  const slug = "public-docs-" + randomUUID();
  const savedLogKey = process.env.LOG_SIGNING_KEY;
  const hash = () => randomBytes(32).toString("hex");
  async function member(orgId: string, role: Role, verified = true) {
    const user = await db.user.create({
      data: {
        email: randomUUID() + "@example.test",
        name: role,
        passwordHash: "test",
        emailVerifiedAt: verified ? new Date() : null,
        memberships: { create: { orgId, role } },
      },
    });
    const keys = generateKeyPairSync("ed25519");
    const x = keys.publicKey.export({ format: "jwk" }).x;
    assert(x);
    const raw = Buffer.from(x, "base64url");
    const fingerprint = createHash("sha256").update(raw).digest("hex");
    if (role === "signer" && verified) {
      const publicKey = raw.toString("hex");
      await db.$transaction(async (tx) => {
        await tx.memberKey.create({
          data: {
            orgId,
            userId: user.id,
            purpose: "sign",
            publicKey,
            fingerprint,
            status: "active",
          },
        });
        await log.append(tx, {
          type: "KEY_REGISTER",
          orgId,
          userId: user.id,
          purpose: "sign",
          publicKey,
          fingerprint,
          approvedBy: user.id,
          approvedAt: new Date().toISOString(),
        });
      });
    }
    const cookie =
      SESSION_COOKIE + "=" + (await app.get(SessionService).issue(user.id, user.tokenVersion));
    return { id: user.id, orgId, fingerprint, key: keys.privateKey, cookie };
  }
  type Member = Awaited<ReturnType<typeof member>>;
  let author: Member, revoker: Member, foreign: Member, issuer: Member, unverified: Member;
  async function issue(who = author, fileHash = hash()) {
    return db.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          fileHash,
          orgId: who.orgId,
          issuerId: issuer.id,
          title: "공개 의결",
          category: "agenda",
          status: "valid",
        },
      });
      const payload: IssuePayload = {
        action: "ISSUE",
        fileHash,
        orgId: who.orgId,
        documentId: doc.id,
        title: doc.title,
        category: doc.category,
        signerId: who.id,
        signerKeyFingerprint: who.fingerprint,
        signedAt: new Date().toISOString(),
      };
      const { leafIndex } = await log.append(tx, {
        payload,
        signature: sign(null, canonicalBytes(payload), who.key).toString("hex"),
      });
      return { id: doc.id, fileHash, orgId: who.orgId, leafIndex };
    });
  }
  type Issued = Awaited<ReturnType<typeof issue>>;
  function signature(doc: Issued, who = revoker, changes: Partial<RevokePayload> = {}) {
    const payload: RevokePayload = {
      action: "REVOKE",
      orgId: doc.orgId,
      documentId: doc.id,
      targetLeafIndex: doc.leafIndex,
      reason: "의결 정정",
      signerId: who.id,
      signerKeyFingerprint: who.fingerprint,
      signedAt: new Date().toISOString(),
      ...changes,
    };
    const { targetLeafIndex, reason, signerKeyFingerprint, signedAt } = payload;
    return {
      targetLeafIndex,
      reason,
      signerKeyFingerprint,
      signedAt,
      signature: sign(null, canonicalBytes(payload), who.key).toString("hex"),
    };
  }
  const get = (path: string) => http(app.getHttpServer()).get("/api/v1" + path);
  const post = (id: string) =>
    http(app.getHttpServer()).post("/api/v1/documents/" + id + "/revoke");
  beforeAll(async () => {
    process.env.LOG_SIGNING_KEY = generateKeyPairSync("ed25519")
      .privateKey.export({ format: "der", type: "pkcs8" })
      .toString("base64");
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureApp(app);
    await app.listen(0, "127.0.0.1");
    db = app.get(PrismaService);
    log = app.get(LogAppendService);
    orgId = (await db.organization.create({ data: { slug, name: "공개 조회 테스트" } })).id;
    otherOrgId = (
      await db.organization.create({ data: { slug: slug + "-other", name: "다른 기관" } })
    ).id;
    author = await member(orgId, "signer");
    revoker = await member(orgId, "signer");
    foreign = await member(otherOrgId, "signer");
    issuer = await member(orgId, "issuer");
    unverified = await member(orgId, "signer", false);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (savedLogKey === undefined) delete process.env.LOG_SIGNING_KEY;
    else process.env.LOG_SIGNING_KEY = savedLogKey;
    await app?.close();
  });

  it("returns all issuances of the same hash, with no unpublished data on any public endpoint", async () => {
    const a = await issue();
    const b = await issue(foreign, a.fileHash);
    const byHash = await get("/verify?hash=" + a.fileHash).expect(200);
    expect(byHash.body).toHaveLength(2);
    expect(byHash.body).toEqual(
      expect.arrayContaining(
        [a, b].map((d) =>
          expect.objectContaining({
            id: d.id,
            fileHash: d.fileHash,
            org: expect.objectContaining({ id: d.orgId }),
            status: "valid",
            issue: expect.objectContaining({ leafIndex: d.leafIndex }),
            revocation: null,
          }),
        ),
      ),
    );
    for (const status of ["pending", "rejected"] as const) {
      const hidden = await db.document.create({
        data: {
          orgId,
          issuerId: issuer.id,
          title: "private",
          category: "other",
          fileHash: hash(),
          status,
        },
      });
      await get("/documents/" + hidden.id).expect(404);
      expect((await get("/verify?hash=" + hidden.fileHash).expect(200)).body).toEqual([]);
      const listing = await get("/orgs/" + slug + "/documents").expect(200);
      expect(listing.text).toContain(a.id);
      expect(listing.text).not.toContain(b.id);
      expect(listing.text).not.toContain(hidden.id);
      expect(listing.text).not.toContain("@example.test");
    }
    expect((await get("/documents/" + a.id).expect(200)).body).toEqual(
      byHash.body.find((d: { id: string }) => d.id === a.id),
    );
    await get("/verify?hash=" + a.fileHash.toUpperCase()).expect(400);
    await get("/verify").expect(400);
    expect((await get("/orgs/" + slug + "-missing/documents").expect(200)).body).toEqual([]);
  });

  it("accepts another current signer of the issuing org exactly once and preserves the ISSUE bytes", async () => {
    const doc = await issue();
    const original = await db.logEntry.findUniqueOrThrow({ where: { leafIndex: doc.leafIndex } });
    const otherSigner = await member(orgId, "signer");
    const requests = [revoker, otherSigner, revoker, otherSigner].map((who) => ({
      who,
      body: signature(doc, who),
    }));
    const results = await Promise.all(
      requests.map(({ who, body }) => post(doc.id).set("Cookie", who.cookie).send(body)),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409]);
    const index = results.findIndex((r) => r.status === 200);
    const result = results[index],
      request = requests[index];
    assert(result && request);
    const { leafIndex } = result.body as { leafIndex: number };
    const { who, body } = request;
    const entries = await db.logEntry.findMany({
      where: { documentId: doc.id },
      orderBy: { leafIndex: "asc" },
    });
    expect(entries.map((e) => e.type)).toEqual(["ISSUE", "REVOKE"]);
    expect(entries[0]).toEqual(original);
    const { signature: signed, ...fields } = body;
    const revokeEntry = entries[1];
    assert(revokeEntry);
    expect(Buffer.from(revokeEntry.entryBytes)).toEqual(
      Buffer.from(
        canonicalBytes({
          payload: { ...fields, action: "REVOKE", documentId: doc.id, orgId, signerId: who.id },
          signature: signed,
        }),
      ),
    );
    expect(await db.revocation.findUniqueOrThrow({ where: { documentId: doc.id } })).toMatchObject({
      leafIndex,
      targetLeafIndex: doc.leafIndex,
      revokedById: who.id,
      reason: body.reason,
    });
    const expected = {
      id: doc.id,
      status: "revoked",
      issue: { leafIndex: doc.leafIndex, signer: { id: author.id } },
      revocation: { leafIndex, signer: { id: who.id } },
    };
    expect((await get("/documents/" + doc.id).expect(200)).body).toMatchObject(expected);
    expect((await get("/verify?hash=" + doc.fileHash).expect(200)).body).toMatchObject([expected]);
  });

  it("requires the matching session, organization role, active key and original target", async () => {
    const doc = await issue(),
      body = signature(doc);
    await post(doc.id).send(body).expect(401);
    for (const who of [issuer, unverified, foreign])
      await post(doc.id).set("Cookie", who.cookie).send(signature(doc, who)).expect(403);
    await post(doc.id)
      .set("Cookie", revoker.cookie)
      .set("X-Expected-User-Id", author.id)
      .send(body)
      .expect(412);
    for (const fields of [
      { reason: "changed" },
      { reason: "  " },
      { reason: "\ud800" },
      { reason: "x\ufe0f".repeat(251) },
      { signature: "00".repeat(64) },
      { signedAt: "2026-04-31T00:00:00.000Z" },
    ]) {
      await post(doc.id)
        .set("Cookie", revoker.cookie)
        .send({ ...body, ...fields })
        .expect(400);
    }
    for (const offset of [-310_000, 310_000]) {
      await post(doc.id)
        .set("Cookie", revoker.cookie)
        .send(signature(doc, revoker, { signedAt: new Date(Date.now() + offset).toISOString() }))
        .expect(400);
    }
    await post(doc.id)
      .set("Cookie", revoker.cookie)
      .send(signature(doc, revoker, { targetLeafIndex: doc.leafIndex + 1 }))
      .expect(409);
    await post(doc.id).set("Cookie", revoker.cookie).send(signature(doc, author)).expect(409);
    const former = await member(orgId, "signer");
    await db.memberKey.update({
      where: { fingerprint: former.fingerprint },
      data: { status: "revoked" },
    });
    await post(doc.id).set("Cookie", former.cookie).send(signature(doc, former)).expect(409);
    expect((await get("/documents/" + doc.id).expect(200)).body.status).toBe("valid");
    expect(await db.logEntry.count({ where: { documentId: doc.id } })).toBe(1);
  });

  it.each(["role", "session"] as const)(
    "rechecks the %s after the request guard",
    async (change) => {
      const doc = await issue(),
        who = await member(orgId, "signer");
      const sessions = app.get(SessionService),
        authenticate = sessions.authenticate.bind(sessions);
      jest.spyOn(sessions, "authenticate").mockImplementationOnce(async (token) => {
        const valid = await authenticate(token);
        if (change === "role") {
          await db.membership.update({
            where: { userId_orgId: { userId: who.id, orgId } },
            data: { role: "issuer" },
          });
        } else {
          await sessions.revokeAll(who.id);
        }
        return valid;
      });
      await post(doc.id)
        .set("Cookie", who.cookie)
        .send(signature(doc, who))
        .expect(change === "role" ? 403 : 401);
      expect(await db.revocation.findUnique({ where: { documentId: doc.id } })).toBeNull();
    },
  );

  it("rolls back the head, counter, revocation and status together when publishing fails", async () => {
    const doc = await issue();
    const before = await db.logState.findUniqueOrThrow({ where: { id: 1 } });
    const append = log.append.bind(log);
    jest.spyOn(log, "append").mockImplementationOnce(async (tx, entry) => {
      await append(tx, entry);
      throw new ServiceUnavailableException("simulated rollback");
    });
    await post(doc.id).set("Cookie", revoker.cookie).send(signature(doc)).expect(503);
    expect(await db.logState.findUniqueOrThrow({ where: { id: 1 } })).toEqual(before);
    expect(await db.revocation.findUnique({ where: { documentId: doc.id } })).toBeNull();
    expect(await db.treeHead.findUnique({ where: { treeSize: before.treeSize + 1 } })).toBeNull();
    expect((await get("/documents/" + doc.id).expect(200)).body.status).toBe("valid");
  });
});
