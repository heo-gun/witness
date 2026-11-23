import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { ServiceUnavailableException, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { EmailTokenService } from "../src/auth/email-token.service.js";
import { SESSION_COOKIE } from "../src/auth/session.config.js";
import { SessionService } from "../src/auth/session.service.js";
import type { KeyPurpose, Role, SignatureRequestStatus } from "../src/generated/prisma/client.js";
import { SthSignerService } from "../src/log/sth-signer.service.js";
import { configureApp } from "../src/main.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

interface Actor {
  id: string;
  cookie: string;
}
interface Key {
  id: string;
  fingerprint: string;
  status: string;
  approvedAt: string | null;
  revokedAt: string | null;
}

function keyBody(purpose: KeyPurpose) {
  const { publicKey } =
    purpose === "sign" ? generateKeyPairSync("ed25519") : generateKeyPairSync("x25519");
  const { x } = publicKey.export({ format: "jwk" });
  assert(x);
  return { publicKey: Buffer.from(x, "base64url").toString("hex"), purpose };
}

describe("member key lifecycle (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: Actor, signer: Actor, issuer: Actor, otherOwner: Actor, unverified: Actor;
  let orgId: string;
  const slug = "keys-" + randomUUID();
  const base = "/api/v1/orgs/" + slug;
  const logKey = process.env.LOG_SIGNING_KEY;

  async function actor(role: Role, organization = orgId, verified = true): Promise<Actor> {
    const user = await prisma.user.create({
      data: {
        email: randomUUID() + "@example.com",
        name: role,
        passwordHash: "test-fixture",
        emailVerifiedAt: verified ? new Date() : null,
        memberships: { create: { orgId: organization, role } },
      },
    });
    const token = await app.get(SessionService).issue(user.id, user.tokenVersion);
    return { id: user.id, cookie: SESSION_COOKIE + "=" + token };
  }
  const register = (who: Actor, body: object) =>
    request(app.getHttpServer())
      .post(base + "/keys")
      .set("Cookie", who.cookie)
      .send(body);
  const get = (who: Actor, path: string) =>
    request(app.getHttpServer())
      .get(base + path)
      .set("Cookie", who.cookie);
  const change = (who: Actor, id: string, action: "approve" | "revoke", body: object) =>
    request(app.getHttpServer())
      .post(`/api/v1/keys/${id}/${action}`)
      .set("Cookie", who.cookie)
      .send(body);
  const treeSize = async () =>
    (await prisma.logState.findUniqueOrThrow({ where: { id: 1 } })).treeSize;

  beforeAll(async () => {
    process.env.LOG_SIGNING_KEY = generateKeyPairSync("ed25519")
      .privateKey.export({ format: "der", type: "pkcs8" })
      .toString("base64");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    orgId = (await prisma.organization.create({ data: { slug, name: "Key tests" } })).id;
    const other = await prisma.organization.create({
      data: { slug: slug + "-other", name: "Other" },
    });
    owner = await actor("owner");
    signer = await actor("signer");
    issuer = await actor("issuer");
    otherOwner = await actor("owner", other.id);
    unverified = await actor("signer", orgId, false);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (logKey === undefined) delete process.env.LOG_SIGNING_KEY;
    else process.env.LOG_SIGNING_KEY = logKey;
    await app?.close();
  });

  it("shows the latest accepted invitation from this organization only in the owner review", async () => {
    const who = await actor("signer");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: who.id } });
    const key = (await register(who, keyBody("sign")).expect(201)).body as Key;
    const at = (offset: number) => new Date(user.createdAt.getTime() + offset);
    const fields = { email: user.email, invitedById: owner.id, role: "signer" as const };
    const other = await prisma.membership.findFirstOrThrow({ where: { userId: otherOwner.id } });
    await prisma.invitation.createMany({
      data: [
        { ...fields, orgId, status: "accepted", createdAt: at(1), respondedAt: at(2) },
        { ...fields, orgId, status: "accepted", createdAt: at(3), respondedAt: at(4) },
        { ...fields, orgId, status: "declined", createdAt: at(5), respondedAt: at(6) },
        { ...fields, orgId: other.orgId, status: "accepted", createdAt: at(7), respondedAt: at(8) },
      ],
    });
    expect((await get(owner, "/keys").expect(200)).body).toContainEqual({
      ...key,
      review: {
        accountCreatedAt: user.createdAt.toISOString(),
        invitationCreatedAt: at(3).toISOString(),
        invitationAcceptedAt: at(4).toISOString(),
      },
    });
    expect((await get(who, "/keys").expect(200)).body).toEqual([key]);
    const approved = (await change(owner, key.id, "approve", {}).expect(200)).body as Key;
    await get(owner, "/members/" + who.id + "/keys").expect(200, [approved]);
  });

  it("registers the caller's pending key and projects approval and revocation from published entries", async () => {
    const before = await treeSize();
    const body = keyBody("sign");
    const fingerprint = createHash("sha256")
      .update(Buffer.from(body.publicKey, "hex"))
      .digest("hex");
    const key = (await register(signer, body).expect(201)).body as Key;
    expect(key).toMatchObject({
      ...body,
      orgId,
      userId: signer.id,
      fingerprint,
      status: "pending",
      approvedAt: null,
      revokedAt: null,
    });
    expect(await treeSize()).toBe(before);
    const target = "/members/" + signer.id + "/keys";
    await get(issuer, target).expect(200, []);
    await get(issuer, "/keys").expect(200, []);
    expect((await get(owner, "/keys").expect(200)).body).toEqual(
      expect.arrayContaining([expect.objectContaining(key)]),
    );
    expect((await get(signer, "/keys").expect(200)).body).toContainEqual(key);
    const approved = (await change(owner, key.id, "approve", {}).expect(200)).body as Key;
    expect(approved).toMatchObject({
      id: key.id,
      status: "active",
      approvedAt: expect.any(String),
      revokedAt: null,
    });
    expect((await get(issuer, target).expect(200)).body).toContainEqual(approved);
    const reason = "기기 교체";
    const revoked = (await change(owner, key.id, "revoke", { reason }).expect(200)).body as Key;
    expect(revoked).toMatchObject({
      status: "revoked",
      approvedAt: approved.approvedAt,
      revokedAt: expect.any(String),
    });
    await get(issuer, target).expect(200, []);
    expect((await get(signer, "/keys").expect(200)).body).toContainEqual(revoked);
    const rows = await prisma.logEntry.findMany({
      where: { keyFingerprint: fingerprint },
      orderBy: { leafIndex: "asc" },
    });
    expect(rows.map((row) => JSON.parse(Buffer.from(row.entryBytes).toString("utf8")))).toEqual([
      {
        type: "KEY_REGISTER",
        ...body,
        fingerprint,
        orgId,
        userId: signer.id,
        approvedBy: owner.id,
        approvedAt: approved.approvedAt,
      },
      {
        type: "KEY_REVOKE",
        fingerprint,
        orgId,
        revokedBy: owner.id,
        revokedAt: revoked.revokedAt,
        reason,
      },
    ]);
    expect(await treeSize()).toBe(before + 2);
    await change(owner, key.id, "approve", {}).expect(409);
    await change(owner, key.id, "revoke", { reason }).expect(409);
    expect(await treeSize()).toBe(before + 2);
  });

  it("restricts every endpoint to authenticated, verified users and the appropriate organization and role", async () => {
    const key = (await register(issuer, keyBody("encrypt")).expect(201)).body as Key;
    const target = "/members/" + issuer.id + "/keys";
    await request(app.getHttpServer())
      .get(base + "/keys")
      .expect(401);
    for (const who of [unverified, otherOwner]) {
      await register(who, keyBody("encrypt")).expect(403);
      await get(who, "/keys").expect(403);
      await get(who, target).expect(403);
    }
    for (const action of ["approve", "revoke"] as const) {
      const body = action === "approve" ? {} : { reason: "test" };
      await change(issuer, key.id, action, body).expect(403);
      await change(otherOwner, key.id, action, body).expect(404);
    }
    await register(issuer, keyBody("sign")).expect(403);
    expect(
      (await change(owner, key.id, "revoke", { reason: "cancel" }).expect(200)).body,
    ).toMatchObject({ approvedAt: null, status: "revoked" });
  });

  it("validates the public key encoding, role, and server-owned registration fields", async () => {
    const body = keyBody("sign");
    for (const invalid of [
      { ...body, publicKey: "AA".repeat(32) },
      { ...body, publicKey: "01".repeat(31) },
      { ...body, purpose: "other" },
      { ...body, userId: issuer.id },
    ])
      await register(signer, invalid).expect(400);
  });

  it("keeps legacy keys visible to the owner and returns only keys still usable by the target", async () => {
    const who = await actor("signer");
    const target = "/members/" + who.id + "/keys";
    const sign = (await register(who, keyBody("sign")).expect(201)).body as Key;
    const encrypt = (await register(who, keyBody("encrypt")).expect(201)).body as Key;
    await change(owner, sign.id, "approve", {}).expect(200);
    await change(owner, encrypt.id, "approve", {}).expect(200);
    // Model records predating the membership and email guards.
    await prisma.membership.update({
      where: { userId_orgId: { userId: who.id, orgId } },
      data: { role: "issuer" },
    });
    expect((await get(issuer, target).expect(200)).body).toEqual([
      expect.objectContaining({ id: encrypt.id }),
    ]);
    await prisma.user.update({ where: { id: who.id }, data: { emailVerifiedAt: null } });
    await get(issuer, target).expect(200, []);
    await get(issuer, "/members/" + otherOwner.id + "/keys").expect(404);
    expect((await get(owner, "/keys").expect(200)).body).toEqual(
      expect.arrayContaining(
        [sign, encrypt].map((key) => expect.objectContaining({ id: key.id, status: "active" })),
      ),
    );
    await change(owner, sign.id, "revoke", { reason: "legacy key cleanup" }).expect(200);
  });

  it("serializes duplicate registrations and permits one active key per user, organization and purpose", async () => {
    const who = await actor("signer");
    const body = keyBody("sign");
    const duplicates = await Promise.all([register(who, body), register(who, body)]);
    expect(duplicates.map((r) => r.status).sort()).toEqual([201, 409]);
    const original = duplicates.find((r) => r.status === 201);
    assert(original);
    const keys = [
      original.body as Key,
      (await register(who, keyBody("sign")).expect(201)).body as Key,
    ];
    const results = await Promise.all(keys.map((k) => change(owner, k.id, "approve", {})));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const active = keys.find((_, i) => results[i]?.status === 200);
    const pending = keys.find((_, i) => results[i]?.status === 409);
    assert(active && pending);
    expect(await prisma.logEntry.count({ where: { keyFingerprint: pending.fingerprint } })).toBe(0);
    await change(owner, active.id, "revoke", { reason: "replace" }).expect(200);
    await change(owner, pending.id, "approve", {}).expect(200);
    expect((await get(issuer, "/members/" + who.id + "/keys").expect(200)).body).toEqual([
      expect.objectContaining({ id: pending.id, status: "active" }),
    ]);
  });

  it("marks only pending ciphertext for a revoked recipient key for resending and rolls back when signing fails", async () => {
    const who = await actor("signer");
    const key = (await register(who, keyBody("encrypt")).expect(201)).body as Key;
    const logSigner = app.get(SthSignerService);
    const failSigning = () =>
      jest.spyOn(logSigner, "sign").mockImplementationOnce(() => {
        throw new ServiceUnavailableException("Test signing outage");
      });
    let before = await treeSize();
    failSigning();
    await change(owner, key.id, "approve", {}).expect(503);
    expect(await prisma.memberKey.findUniqueOrThrow({ where: { id: key.id } })).toMatchObject({
      status: "pending",
    });
    expect(await treeSize()).toBe(before);
    await change(owner, key.id, "approve", {}).expect(200);
    const seedRequest = async (
      fingerprint: string,
      status: SignatureRequestStatus,
      deletedAt: Date | null = null,
    ) =>
      prisma.signatureRequest.create({
        data: {
          org: { connect: { id: orgId } },
          signer: { connect: { id: who.id } },
          requester: { connect: { id: issuer.id } },
          document: {
            create: {
              orgId,
              issuerId: issuer.id,
              category: "budget",
              title: "test",
              fileHash: randomBytes(32).toString("hex"),
            },
          },
          status,
          encryptedFile: {
            create: {
              recipientFingerprint: fingerprint,
              size: 1,
              storageKey: randomUUID(),
              ephemeralPublicKey: keyBody("encrypt").publicKey,
              iv: randomBytes(12).toString("hex"),
              deletedAt,
            },
          },
        },
      });
    const requests = await Promise.all([
      seedRequest(key.fingerprint, "pending"),
      seedRequest(randomBytes(32).toString("hex"), "pending"),
      seedRequest(key.fingerprint, "signed"),
      seedRequest(key.fingerprint, "pending", new Date()),
    ]);
    before = await treeSize();
    failSigning();
    await change(owner, key.id, "revoke", { reason: "outage" }).expect(503);
    expect(await treeSize()).toBe(before);
    expect((await prisma.memberKey.findUniqueOrThrow({ where: { id: key.id } })).status).toBe(
      "active",
    );
    const statuses = () =>
      Promise.all(
        requests.map(
          async (r) =>
            (await prisma.signatureRequest.findUniqueOrThrow({ where: { id: r.id } })).status,
        ),
      );
    expect(await statuses()).toEqual(["pending", "pending", "signed", "pending"]);
    await change(owner, key.id, "revoke", { reason: "replace" }).expect(200);
    expect(await statuses()).toEqual(["needs_resend", "pending", "signed", "pending"]);
  });

  it("refuses a queued registration if email recovery invalidates the session after authentication", async () => {
    const who = await actor("signer");
    const token = randomBytes(32).toString("hex");
    await prisma.emailToken.create({
      data: {
        userId: who.id,
        purpose: "reset_password",
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const sessions = app.get(SessionService);
    const authenticate = sessions.authenticate.bind(sessions);
    jest.spyOn(sessions, "authenticate").mockImplementationOnce(async (presented) => {
      const validated = await authenticate(presented);
      await app
        .get(EmailTokenService)
        .consume({ token, purpose: "reset_password", password: "fixture-recovery-password" });
      return validated;
    });
    await register(who, keyBody("sign")).expect(401);
    expect(await prisma.memberKey.count({ where: { userId: who.id } })).toBe(0);
  });
});
