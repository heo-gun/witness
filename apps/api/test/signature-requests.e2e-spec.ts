import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ServiceUnavailableException, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { SESSION_COOKIE } from "../src/auth/session.config.js";
import { SessionService } from "../src/auth/session.service.js";
import type { KeyPurpose, KeyStatus, Role } from "../src/generated/prisma/client.js";
import { configureApp } from "../src/main.js";
import { RolesGuard } from "../src/orgs/roles.guard.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

interface Actor {
  id: string;
  cookie: string;
}

describe("signature request creation (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const slug = "requests-" + randomUUID();
  const base = `/api/v1/orgs/${slug}`;
  let orgId: string, otherOrgId: string;
  let issuer: Actor, signer: Actor, owner: Actor, otherIssuer: Actor;

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
  function key(userId: string, purpose: KeyPurpose, status: KeyStatus, organization = orgId) {
    const raw = randomBytes(32);
    return prisma.memberKey.create({
      data: {
        userId,
        orgId: organization,
        purpose,
        status,
        publicKey: raw.toString("hex"),
        fingerprint: createHash("sha256").update(raw).digest("hex"),
      },
    });
  }
  const input = () => ({
    signerId: signer.id,
    title: "예산안",
    category: "budget",
    fileHash: randomBytes(32).toString("hex"),
  });
  const post = (who: Actor, body: object, path = base) =>
    request(app.getHttpServer())
      .post(path + "/signature-requests")
      .set("Cookie", who.cookie)
      .send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    orgId = (await prisma.organization.create({ data: { name: "서명 요청", slug } })).id;
    otherOrgId = (
      await prisma.organization.create({ data: { name: "다른 기관", slug: slug + "-other" } })
    ).id;
    issuer = await actor("issuer");
    owner = await actor("owner");
    signer = await actor("signer");
    otherIssuer = await actor("issuer", otherOrgId);
    await key(signer.id, "encrypt", "active");
  });
  afterAll(async () => {
    await app?.close();
  });
  afterEach(() => jest.restoreAllMocks());

  it("stores the document and assigned request together without publishing a log or storing a file", async () => {
    const body = input();
    const result = await post(issuer, { ...body, title: "  " + body.title + " " }).expect(201);
    const document = await prisma.document.findUniqueOrThrow({
      where: { orgId_fileHash: { orgId, fileHash: body.fileHash } },
      include: { signatureRequest: { include: { encryptedFile: true } }, logEntries: true },
    });
    expect(document).toMatchObject({
      orgId,
      issuerId: issuer.id,
      title: body.title,
      category: body.category,
      status: "pending",
      logEntries: [],
      signatureRequest: {
        orgId,
        requesterId: issuer.id,
        signerId: signer.id,
        status: "awaiting_upload",
        encryptedFile: null,
      },
    });
    expect(result.body).toEqual({
      documentId: document.id,
      id: document.signatureRequest?.id,
      status: "awaiting_upload",
    });
  });

  it("rolls the pending document back if the request cannot be saved", async () => {
    const body = input();
    const failure = jest
      .spyOn(prisma, "$transaction")
      .mockImplementationOnce(async (operation, options) => {
        failure.mockRestore();
        if (typeof operation !== "function") throw new Error("Expected interactive transaction");
        return prisma.$transaction(async (tx) => {
          const write = jest
            .spyOn(tx.signatureRequest, "create")
            .mockRejectedValueOnce(new ServiceUnavailableException("Test write failure"));
          try {
            return await operation(tx);
          } finally {
            write.mockRestore();
          }
        }, options);
      });
    await post(issuer, body).expect(503);
    expect(await prisma.document.count({ where: { orgId, fileHash: body.fileHash } })).toBe(0);
    await post(issuer, body).expect(201);
  });

  it("requires a verified issuer in this organization and checks the expected browser account", async () => {
    const body = input();
    await request(app.getHttpServer())
      .post(base + "/signature-requests")
      .send(body)
      .expect(401);
    const unverified = await actor("issuer", orgId, false);
    for (const who of [owner, signer, unverified, otherIssuer]) await post(who, body).expect(403);
    await post(issuer, body).set("x-expected-user-id", signer.id).expect(412);
    expect(await prisma.document.count({ where: { orgId, fileHash: body.fileHash } })).toBe(0);
  });

  it("allows only valid metadata and rejects file contents or caller-supplied server fields", async () => {
    const body = input();
    for (const invalid of [
      { title: "  " },
      { title: "a".repeat(201) },
      { category: "unknown" },
      { signerId: "invalid" },
      { fileHash: "A".repeat(64) },
      { fileHash: "0".repeat(63) },
      { file: "원본" },
      { requesterId: issuer.id },
    ])
      await post(issuer, { ...body, ...invalid }).expect(400);
    expect(await prisma.document.count({ where: { orgId, fileHash: body.fileHash } })).toBe(0);
  });

  it("matches the recipient selector to a verified signer with an active encryption key in this org", async () => {
    const unavailable = await actor("signer");
    const unverified = await actor("signer", orgId, false);
    const outside = await actor("signer", otherOrgId);
    await prisma.membership.create({
      data: { userId: unavailable.id, orgId: otherOrgId, role: "signer" },
    });
    await key(unavailable.id, "sign", "active");
    await key(unavailable.id, "encrypt", "revoked");
    await key(unavailable.id, "encrypt", "pending");
    await key(unavailable.id, "encrypt", "active", otherOrgId);
    await key(outside.id, "encrypt", "active", otherOrgId);
    await key(unverified.id, "encrypt", "active");
    await key(owner.id, "encrypt", "active");
    const members = (
      await request(app.getHttpServer())
        .get(base + "/members")
        .set("Cookie", issuer.cookie)
        .expect(200)
    ).body as {
      userId: string;
      canReceiveSignatureRequest: boolean;
    }[];
    const eligible = members
      .filter((member) => member.canReceiveSignatureRequest)
      .map((member) => member.userId);
    expect(eligible).toEqual([signer.id]);
    const body = input();
    for (const who of [issuer, owner, unavailable, unverified, outside]) {
      await post(issuer, { ...body, signerId: who.id }).expect(400);
    }
    expect(await prisma.document.count({ where: { orgId, fileHash: body.fileHash } })).toBe(0);
  });

  it.each(["role", "session"] as const)(
    "rechecks the issuer's %s after the organization guard",
    async (change) => {
      const who = await actor("issuer");
      const guard = RolesGuard.prototype.canActivate;
      jest.spyOn(RolesGuard.prototype, "canActivate").mockImplementationOnce(async function (
        this: RolesGuard,
        context,
      ) {
        const allowed = await guard.call(this, context);
        if (change === "role") {
          await prisma.membership.update({
            where: { userId_orgId: { userId: who.id, orgId } },
            data: { role: "signer" },
          });
        } else {
          await prisma.user.update({
            where: { id: who.id },
            data: { tokenVersion: { increment: 1 } },
          });
        }
        return allowed;
      });
      const body = input();
      await post(who, body).expect(change === "role" ? 403 : 401);
      expect(await prisma.document.count({ where: { orgId, fileHash: body.fileHash } })).toBe(0);
    },
  );

  it("serializes same-hash submissions and keeps documents of other organizations independent", async () => {
    const body = input();
    const results = await Promise.all([post(issuer, body), post(issuer, body)]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const created = results.find((result) => result.status === 201);
    assert(created);
    expect(results.find((result) => result.status === 409)?.body).toMatchObject({
      existing: created.body,
    });
    expect(
      await prisma.signatureRequest.count({
        where: { orgId, document: { fileHash: body.fileHash } },
      }),
    ).toBe(1);
    const otherSigner = await actor("signer", otherOrgId);
    await key(otherSigner.id, "encrypt", "active", otherOrgId);
    const other = await post(
      otherIssuer,
      { ...body, signerId: otherSigner.id },
      base + "-other",
    ).expect(201);
    expect(other.body).not.toEqual(created.body);
  });

  it("preserves a rejection and reveals its reference only to the original requester", async () => {
    const body = input();
    const created = (await post(issuer, body).expect(201)).body as {
      id: string;
      documentId: string;
    };
    const rejected = await prisma.signatureRequest.update({
      where: { id: created.id },
      data: {
        status: "rejected",
        rejectReason: "수정 필요",
        decidedAt: new Date(),
        document: { update: { status: "rejected" } },
      },
      include: { document: true },
    });
    const retry = { ...body, title: "두 번째 제출" };
    expect((await post(issuer, retry).expect(409)).body).toMatchObject({
      existing: { ...created, status: "rejected" },
    });
    const secondIssuer = await actor("issuer");
    const conflict = await post(secondIssuer, retry).expect(409);
    expect(conflict.body).not.toHaveProperty("existing");
    for (const privateValue of [created.id, created.documentId, rejected.rejectReason])
      expect(conflict.text).not.toContain(privateValue);
    expect(
      await prisma.signatureRequest.findUniqueOrThrow({
        where: { id: created.id },
        include: { document: true },
      }),
    ).toEqual(rejected);
  });
});
