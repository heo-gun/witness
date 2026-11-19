import { createHash, randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { SESSION_COOKIE } from "../src/auth/session.config.js";
import { configureApp } from "../src/main.js";
import { MembersService } from "../src/members/members.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

describe("Members and invitations (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: Actor;
  let signer: Actor;
  let issuer: Actor;
  let outsider: Actor;
  let orgId: string;
  const prefix = `membertest-${randomUUID()}`;
  const slug = `${prefix}-main`;
  const base = `/api/v1/orgs/${slug}`;
  const userIds: string[] = [];
  const tokens = new Map<string, string>();

  async function actor(label: string): Promise<Actor> {
    const user = await prisma.user.create({
      data: {
        email: `${prefix}-${label}@example.com`,
        name: label,
        passwordHash: "unused-fixture-hash",
      },
    });
    userIds.push(user.id);
    return {
      id: user.id,
      email: user.email,
      cookie: `${SESSION_COOKIE}=${await app.get(JwtService).signAsync({ sub: user.id })}`,
    };
  }

  async function invite(email: string, role = "signer") {
    const res = await request(app.getHttpServer())
      .post(`${base}/invitations`)
      .set("Cookie", owner.cookie)
      .send({ email, role })
      .expect(201);
    const { invitationPath, ...invitation } = res.body as {
      id: string;
      email: string;
      role: string;
      status: string;
      expiresAt: string;
      invitationPath: string;
    };
    const token = invitationPath.split("#")[1];
    if (!token) throw new Error("Creation response did not include an invitation token");
    tokens.set(invitation.id, token);
    expect(res.headers["cache-control"]).toBe("no-store");
    return invitation;
  }

  function respond(id: string, who: Actor, action = "accept") {
    return request(app.getHttpServer())
      .post(`/api/v1/invitations/${id}/${action}`)
      .set("Cookie", who.cookie)
      .send({ token: tokens.get(id) ?? "0".repeat(64) });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    owner = await actor("owner");
    signer = await actor("signer");
    issuer = await actor("issuer");
    outsider = await actor("outsider");
    const org = await prisma.organization.create({
      data: {
        name: "멤버 테스트",
        slug,
        memberships: {
          create: [
            { userId: owner.id, role: "owner" },
            { userId: signer.id, role: "signer" },
            { userId: issuer.id, role: "issuer" },
          ],
        },
      },
    });
    orgId = org.id;
    await prisma.organization.create({
      data: {
        name: "다른 기관",
        slug: `${prefix}-other`,
        memberships: { create: { userId: outsider.id, role: "owner" } },
      },
    });
  });

  afterAll(async () => {
    try {
      if (prisma) {
        const where = { org: { slug: { startsWith: prefix } } };
        await prisma.signatureRequest.deleteMany({ where });
        await prisma.document.deleteMany({ where });
        await prisma.memberKey.deleteMany({ where });
        await prisma.invitation.deleteMany({ where });
        await prisma.membership.deleteMany({ where });
        await prisma.organization.deleteMany({ where: { slug: { startsWith: prefix } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await app?.close();
    }
  });

  it.each(["owner", "signer", "issuer"] as const)(
    "lets %s list public member information",
    async (role) => {
      const res = await request(app.getHttpServer())
        .get(`${base}/members`)
        .set("Cookie", { owner, signer, issuer }[role].cookie)
        .expect(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.body).toEqual(
        expect.arrayContaining([
          {
            userId: owner.id,
            orgId,
            role: "owner",
            createdAt: expect.any(String),
            user: { id: owner.id, name: "owner", email: owner.email },
          },
        ]),
      );
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    },
  );

  it("denies non-members, including owners of other organizations", async () => {
    await request(app.getHttpServer())
      .get(`${base}/members`)
      .set("Cookie", outsider.cookie)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${base}/members/${signer.id}`)
      .set("Cookie", outsider.cookie)
      .send({ role: "owner" })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`${base}/members/${signer.id}`)
      .set("Cookie", outsider.cookie)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(`${base}/invitations`)
      .set("Cookie", outsider.cookie)
      .send({ email: outsider.email, role: "owner" })
      .expect(403);
  });

  it.each(["signer", "issuer"] as const)("denies all owner writes by %s", async (role) => {
    const who = { signer, issuer }[role];
    await request(app.getHttpServer())
      .patch(`${base}/members/${signer.id}`)
      .set("Cookie", who.cookie)
      .send({ role: "owner" })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`${base}/members/${signer.id}`)
      .set("Cookie", who.cookie)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(`${base}/invitations`)
      .set("Cookie", who.cookie)
      .send({ email: outsider.email, role: "signer" })
      .expect(403);
  });

  it("requires authentication on all seven endpoints", async () => {
    await request(app.getHttpServer()).get(`${base}/members`).expect(401);
    await request(app.getHttpServer())
      .patch(`${base}/members/${signer.id}`)
      .send({ role: "issuer" })
      .expect(401);
    await request(app.getHttpServer()).delete(`${base}/members/${signer.id}`).send({}).expect(401);
    await request(app.getHttpServer())
      .post(`${base}/invitations`)
      .send({ email: outsider.email, role: "signer" })
      .expect(401);
    await request(app.getHttpServer()).get("/api/v1/me/invitations").expect(401);
    for (const action of ["accept", "decline"]) {
      await request(app.getHttpServer())
        .post(`/api/v1/invitations/${randomUUID()}/${action}`)
        .send({})
        .expect(401);
    }
  });

  it("changes roles, treats the same role as a no-op, and preserves the last owner", async () => {
    await request(app.getHttpServer())
      .patch(`${base}/members/${issuer.id}`)
      .set("Cookie", owner.cookie)
      .send({ role: "signer" })
      .expect(200);
    expect(
      await prisma.membership.findUnique({ where: { userId_orgId: { userId: issuer.id, orgId } } }),
    ).toMatchObject({ role: "signer" });
    await request(app.getHttpServer())
      .patch(`${base}/members/${issuer.id}`)
      .set("Cookie", owner.cookie)
      .send({ role: "issuer" })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`${base}/members/${owner.id}`)
      .set("Cookie", owner.cookie)
      .send({ role: "owner" })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`${base}/members/${owner.id}`)
      .set("Cookie", owner.cookie)
      .send({ role: "issuer" })
      .expect(409);
    await request(app.getHttpServer())
      .delete(`${base}/members/${owner.id}`)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(409);
  });

  it("allows removing a member and immediately denies their subsequent reads", async () => {
    const target = await actor("remove");
    await prisma.membership.create({ data: { userId: target.id, orgId, role: "issuer" } });
    await request(app.getHttpServer())
      .delete(`${base}/members/${target.id}`)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(204);
    await request(app.getHttpServer())
      .get(`${base}/members`)
      .set("Cookie", target.cookie)
      .expect(403);
  });

  it("blocks an email squatter from accepting an invitation without its secret", async () => {
    const email = `${prefix}-squatter@example.com`;
    const registration = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, name: "squatter", password: "squatter-test-password" })
      .expect(201);
    const id = (registration.body as { id: string }).id;
    userIds.push(id);
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: "squatter-test-password" })
      .expect(200);
    const cookie = login.get("Set-Cookie")?.[0];
    if (!cookie) throw new Error("Login did not set a session cookie");
    const attacker = { id, email, cookie };
    const pending = await invite(attacker.email, "signer");
    await request(app.getHttpServer())
      .post(`/api/v1/invitations/${pending.id}/accept`)
      .set("Cookie", attacker.cookie)
      .send({})
      .expect(400);
    expect(await prisma.membership.count({ where: { orgId, userId: attacker.id } })).toBe(0);
  });

  it("stores only a hash, gives a 72-hour expiry and never lists the secret", async () => {
    const recipient = await actor("secret");
    const before = Date.now();
    const pending = await invite(recipient.email);
    const token = tokens.get(pending.id);
    if (!token) throw new Error("Missing test token");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: pending.id } });
    expect(stored.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    if (!stored.expiresAt) throw new Error("Invitation did not expire");
    expect(stored.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 72 * 60 * 60 * 1000);
    expect(stored.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 72 * 60 * 60 * 1000);
    const list = await request(app.getHttpServer())
      .get("/api/v1/me/invitations")
      .set("Cookie", recipient.cookie)
      .expect(200);
    expect(JSON.stringify(list.body)).not.toMatch(/tokenHash|invitationPath/);
    expect(JSON.stringify(list.body)).not.toContain(token);
    await respond(pending.id, recipient).expect(200);
    expect(
      (await prisma.invitation.findUniqueOrThrow({ where: { id: pending.id } })).tokenHash,
    ).toBeNull();
  });

  it.each(["accept", "decline"])(
    "rejects malformed and incorrect tokens for %s",
    async (action) => {
      const recipient = await actor(`tamper-${action}`);
      const pending = await invite(recipient.email);
      for (const body of [
        {},
        { token: null },
        { token: "a".repeat(63) },
        { token: "A".repeat(64) },
        { token: "0".repeat(64), extra: true },
      ]) {
        await request(app.getHttpServer())
          .post(`/api/v1/invitations/${pending.id}/${action}`)
          .set("Cookie", recipient.cookie)
          .send(body)
          .expect(400);
      }
      await request(app.getHttpServer())
        .post(`/api/v1/invitations/${pending.id}/${action}`)
        .set("Cookie", recipient.cookie)
        .send({ token: "0".repeat(64) })
        .expect(403);
      await respond(pending.id, outsider, action).expect(403);
      expect(
        (await prisma.invitation.findUniqueOrThrow({ where: { id: pending.id } })).status,
      ).toBe("pending");
      expect(await prisma.membership.count({ where: { orgId, userId: recipient.id } })).toBe(0);
    },
  );

  it.each(["expired", "legacy"])(
    "rejects %s invitations, omits them and allows a replacement",
    async (kind) => {
      const recipient = await actor(kind);
      const pending = await invite(recipient.email);
      await prisma.invitation.update({
        where: { id: pending.id },
        data: kind === "expired" ? { expiresAt: new Date() } : { tokenHash: null, expiresAt: null },
      });
      await respond(pending.id, recipient).expect(409);
      await respond(pending.id, recipient, "decline").expect(409);
      const list = await request(app.getHttpServer())
        .get("/api/v1/me/invitations")
        .set("Cookie", recipient.cookie)
        .expect(200);
      expect(list.body).toEqual([]);
      const replacement = await invite(recipient.email);
      expect(tokens.get(replacement.id)).not.toBe(tokens.get(pending.id));
      await respond(replacement.id, recipient).expect(200);
    },
  );

  it("restricts cancellation to an owner of the same organization and prevents replay", async () => {
    const recipient = await actor("cancel");
    const pending = await invite(recipient.email);
    const route = `${base}/invitations/${pending.id}`;
    await request(app.getHttpServer()).delete(route).expect(401);
    for (const who of [recipient, signer, outsider]) {
      await request(app.getHttpServer())
        .delete(route)
        .set("Cookie", who.cookie)
        .send({})
        .expect(403);
    }
    await request(app.getHttpServer())
      .delete(`/api/v1/orgs/${prefix}-other/invitations/${pending.id}`)
      .set("Cookie", outsider.cookie)
      .send({})
      .expect(404);
    const cancelled = await request(app.getHttpServer())
      .delete(route)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(200);
    expect(cancelled.body).toMatchObject({ status: "cancelled" });
    expect(
      (await prisma.invitation.findUniqueOrThrow({ where: { id: pending.id } })).tokenHash,
    ).toBeNull();
    await respond(pending.id, recipient).expect(409);
    await respond(pending.id, recipient, "decline").expect(409);
    await request(app.getHttpServer())
      .delete(route)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(409);
    await invite(recipient.email);
  });

  it("serializes acceptance against cancellation", async () => {
    const recipient = await actor("cancel-race");
    const pending = await invite(recipient.email);
    const results = await Promise.all([
      respond(pending.id, recipient),
      request(app.getHttpServer())
        .delete(`${base}/invitations/${pending.id}`)
        .set("Cookie", owner.cookie)
        .send({}),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    const final = await prisma.invitation.findUniqueOrThrow({ where: { id: pending.id } });
    expect(final.tokenHash).toBeNull();
    expect(await prisma.membership.count({ where: { orgId, userId: recipient.id } })).toBe(
      final.status === "accepted" ? 1 : 0,
    );
  });

  it("normalizes invitation email, allows an unregistered address and returns MVP fields", async () => {
    const email = `${prefix}-future@example.com`;
    const result = await invite(`  ${email.toUpperCase()}  `);
    expect(result).toEqual({
      id: expect.any(String),
      email,
      orgId,
      role: "signer",
      status: "pending",
      invitedBy: owner.id,
      createdAt: expect.any(String),
      expiresAt: expect.any(String),
      org: { id: orgId, name: "멤버 테스트", slug },
    });
    const future = await actor("future");
    await respond(result.id, future).expect(200);
    expect(
      await prisma.membership.findUnique({ where: { userId_orgId: { userId: future.id, orgId } } }),
    ).toMatchObject({ role: "signer" });
  });

  it("rejects existing members and duplicate normalized pending invitations", async () => {
    await request(app.getHttpServer())
      .post(`${base}/invitations`)
      .set("Cookie", owner.cookie)
      .send({ email: signer.email, role: "issuer" })
      .expect(409);
    await invite(`${prefix}-duplicate@example.com`);
    await request(app.getHttpServer())
      .post(`${base}/invitations`)
      .set("Cookie", owner.cookie)
      .send({ email: ` ${prefix.toUpperCase()}-DUPLICATE@EXAMPLE.COM `, role: "owner" })
      .expect(409);
  });

  it("lists only the recipient's pending invitations and omits completed ones", async () => {
    const recipient = await actor("list");
    const pending = await invite(recipient.email);
    const res = await request(app.getHttpServer())
      .get("/api/v1/me/invitations")
      .set("Cookie", recipient.cookie)
      .expect(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toEqual([pending]);
    const other = await request(app.getHttpServer())
      .get("/api/v1/me/invitations")
      .set("Cookie", issuer.cookie)
      .expect(200);
    expect(other.body).toEqual([]);
    await respond(pending.id, recipient, "decline").expect(200);
    const completed = await request(app.getHttpServer())
      .get("/api/v1/me/invitations")
      .set("Cookie", recipient.cookie)
      .expect(200);
    expect(completed.body).toEqual([]);
    expect(await prisma.membership.count({ where: { userId: recipient.id, orgId } })).toBe(0);
    expect(await prisma.invitation.findUnique({ where: { id: pending.id } })).toMatchObject({
      status: "declined",
      respondedAt: expect.any(Date),
    });
    await respond(pending.id, recipient).expect(409);
    await respond(pending.id, recipient, "decline").expect(409);
    await invite(recipient.email, "issuer");
  });

  it("accepts the invited role atomically and prevents replay", async () => {
    const recipient = await actor("accept");
    const pending = await invite(recipient.email, "owner");
    const res = await respond(pending.id, recipient).expect(200);
    expect(res.body).toMatchObject({ status: "accepted", role: "owner" });
    expect(
      await prisma.membership.findUnique({
        where: { userId_orgId: { userId: recipient.id, orgId } },
      }),
    ).toMatchObject({ role: "owner" });
    expect(await prisma.invitation.findUnique({ where: { id: pending.id } })).toMatchObject({
      status: "accepted",
      respondedAt: expect.any(Date),
    });
    await respond(pending.id, recipient).expect(409);
    await respond(pending.id, recipient, "decline").expect(409);
    await prisma.membership.delete({ where: { userId_orgId: { userId: recipient.id, orgId } } });
  });

  it("rejects another user's accept and decline, including the inviting owner", async () => {
    const pending = await invite(`${prefix}-private@example.com`);
    for (const who of [owner, outsider]) {
      await respond(pending.id, who).expect(403);
      await respond(pending.id, who, "decline").expect(403);
    }
    expect(await prisma.invitation.findUnique({ where: { id: pending.id } })).toMatchObject({
      status: "pending",
    });
  });

  it("does not overwrite membership when accepting an obsolete invitation", async () => {
    const recipient = await actor("existing");
    const pending = await invite(recipient.email, "owner");
    await prisma.membership.create({ data: { userId: recipient.id, orgId, role: "issuer" } });
    await respond(pending.id, recipient).expect(409);
    expect(await prisma.invitation.findUnique({ where: { id: pending.id } })).toMatchObject({
      status: "pending",
      respondedAt: null,
    });
    expect(
      await prisma.membership.findUnique({
        where: { userId_orgId: { userId: recipient.id, orgId } },
      }),
    ).toMatchObject({ role: "issuer" });
  });

  it("serializes duplicate invitations without a schema change", async () => {
    const email = `${prefix}-race@example.com`;
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post(`${base}/invitations`)
          .set("Cookie", owner.cookie)
          .send({ email, role: "signer" }),
      ),
    );
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(await prisma.invitation.count({ where: { orgId, email, status: "pending" } })).toBe(1);
  });

  it.each(["accept", "decline"])("serializes concurrent accept and %s", async (action) => {
    const recipient = await actor(`race-${action}`);
    const pending = await invite(recipient.email);
    const results = await Promise.all([
      respond(pending.id, recipient),
      respond(pending.id, recipient, action),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    const final = await prisma.invitation.findUniqueOrThrow({ where: { id: pending.id } });
    expect(await prisma.membership.count({ where: { orgId, userId: recipient.id } })).toBe(
      final.status === "accepted" ? 1 : 0,
    );
    expect(final.respondedAt).toBeInstanceOf(Date);
  });

  it("keeps an owner when both owners concurrently demote themselves", async () => {
    const second = await actor("second-owner");
    await prisma.membership.create({ data: { userId: second.id, orgId, role: "owner" } });
    const results = await Promise.all(
      [owner, second].map((who) =>
        request(app.getHttpServer())
          .patch(`${base}/members/${who.id}`)
          .set("Cookie", who.cookie)
          .send({ role: "issuer" }),
      ),
    );
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(await prisma.membership.count({ where: { orgId, role: "owner" } })).toBe(1);
    await prisma.membership.update({
      where: { userId_orgId: { userId: owner.id, orgId } },
      data: { role: "owner" },
    });
    await prisma.membership.delete({ where: { userId_orgId: { userId: second.id, orgId } } });
  });

  it("rechecks owner authorization inside the write transaction", async () => {
    await expect(
      app.get(MembersService).asOwner(orgId, issuer.id, async () => "unexpected"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it.each(["pending", "active"] as const)(
    "blocks changes for a member with a %s key",
    async (status) => {
      const fingerprint = randomUUID().replaceAll("-", "").repeat(2);
      const key = await prisma.memberKey.create({
        data: {
          orgId,
          userId: signer.id,
          purpose: "sign",
          publicKey: fingerprint,
          fingerprint,
          status,
        },
      });
      try {
        await request(app.getHttpServer())
          .patch(`${base}/members/${signer.id}`)
          .set("Cookie", owner.cookie)
          .send({ role: "issuer" })
          .expect(409);
        await request(app.getHttpServer())
          .delete(`${base}/members/${signer.id}`)
          .set("Cookie", owner.cookie)
          .send({})
          .expect(409);
        await request(app.getHttpServer())
          .patch(`${base}/members/${signer.id}`)
          .set("Cookie", owner.cookie)
          .send({ role: "signer" })
          .expect(200);
      } finally {
        await prisma.memberKey.delete({ where: { id: key.id } });
      }
    },
  );

  it.each(["awaiting_upload", "pending", "needs_resend"] as const)(
    "blocks membership changes for %s requests",
    async (status) => {
      const document = await prisma.document.create({
        data: {
          orgId,
          issuerId: issuer.id,
          title: "대기 문서",
          category: "other",
          fileHash: randomUUID().replaceAll("-", "").repeat(2),
        },
      });
      const pending = await prisma.signatureRequest.create({
        data: {
          orgId,
          documentId: document.id,
          requesterId: issuer.id,
          signerId: signer.id,
          status,
        },
      });
      try {
        for (const who of [signer, issuer]) {
          await request(app.getHttpServer())
            .patch(`${base}/members/${who.id}`)
            .set("Cookie", owner.cookie)
            .send({ role: "owner" })
            .expect(409);
          await request(app.getHttpServer())
            .delete(`${base}/members/${who.id}`)
            .set("Cookie", owner.cookie)
            .send({})
            .expect(409);
        }
      } finally {
        await prisma.signatureRequest.delete({ where: { id: pending.id } });
        await prisma.document.delete({ where: { id: document.id } });
      }
    },
  );

  it.each([{}, { role: "admin" }, { role: null }, { role: "issuer", userId: "injected" }])(
    "validates role bodies (%#)",
    async (input) => {
      await request(app.getHttpServer())
        .patch(`${base}/members/${signer.id}`)
        .set("Cookie", owner.cookie)
        .send(input)
        .expect(400);
    },
  );

  it.each([
    {},
    { email: "bad", role: "signer" },
    { email: null, role: "signer" },
    { email: "a@example.com", role: "admin" },
    { email: "a@example.com" },
    { email: "a@example.com", role: "signer", invitedBy: "injected" },
  ])("validates invitations and rejects injected fields (%#)", async (input) => {
    await request(app.getHttpServer())
      .post(`${base}/invitations`)
      .set("Cookie", owner.cookie)
      .send(input)
      .expect(400);
  });

  it("validates UUIDs and slugs and distinguishes missing resources", async () => {
    for (const id of ["invalid", "00000000-0000-7000-8000-000000000000"]) {
      const expected = id === "invalid" ? 400 : 404;
      await request(app.getHttpServer())
        .patch(`${base}/members/${id}`)
        .set("Cookie", owner.cookie)
        .send({ role: "issuer" })
        .expect(expected);
      await request(app.getHttpServer())
        .delete(`${base}/members/${id}`)
        .set("Cookie", owner.cookie)
        .send({})
        .expect(expected);
      await respond(id, outsider).expect(expected);
      await respond(id, outsider, "decline").expect(expected);
    }
    await request(app.getHttpServer())
      .get("/api/v1/orgs/invalid_slug/members")
      .set("Cookie", owner.cookie)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/orgs/${prefix}-missing/members`)
      .set("Cookie", owner.cookie)
      .expect(404);
  });

  it("enforces JSON and same-site writes on all new mutation routes", async () => {
    const pending = await invite(`${prefix}-csrf@example.com`);
    const writes = [
      () => request(app.getHttpServer()).patch(`${base}/members/${signer.id}`),
      () => request(app.getHttpServer()).delete(`${base}/members/${signer.id}`),
      () => request(app.getHttpServer()).post(`${base}/invitations`),
      () => request(app.getHttpServer()).delete(`${base}/invitations/${pending.id}`),
      () => request(app.getHttpServer()).post(`/api/v1/invitations/${pending.id}/accept`),
      () => request(app.getHttpServer()).post(`/api/v1/invitations/${pending.id}/decline`),
    ];
    for (const write of writes) {
      await write()
        .set("Cookie", owner.cookie)
        .set("Sec-Fetch-Site", "cross-site")
        .send({})
        .expect(403);
      await write().set("Cookie", owner.cookie).type("form").send({}).expect(415);
    }
  });
});
