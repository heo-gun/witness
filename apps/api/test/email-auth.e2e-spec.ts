import { createHash, randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { MailService } from "../src/auth/mail.service.js";
import { EmailTokenService } from "../src/auth/email-token.service.js";
import { SessionService } from "../src/auth/session.service.js";
import { PasswordService } from "../src/auth/password.service.js";
import { SESSION_COOKIE } from "../src/auth/session.config.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { OrgsService } from "../src/orgs/orgs.service.js";
import { MembersService } from "../src/members/members.service.js";
import { configureApp } from "../src/main.js";
import type { EmailTokenPurpose } from "../src/generated/prisma/client.js";

describe("Email verification and recovery", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ids: string[] = [];
  const orgIds: string[] = [];
  const mailbox: { email: string; token: string; purpose: EmailTokenPurpose }[] = [];
  const send = jest.fn(async (email: string, token: string, purpose: EmailTokenPurpose) => {
    mailbox.push({ email, token, purpose });
  });
  const password = "original-test-password";
  const replacement = "new-owner-password";
  const post = (path: string) => request(app.getHttpServer()).post(`/api/v1/auth/${path}`);
  const latest = (email: string) => {
    const message = mailbox.filter((mail) => mail.email === email).at(-1);
    if (!message) throw new Error("No email received");
    return message;
  };
  async function account(verified = false) {
    const user = await prisma.user.create({
      data: {
        email: `email-${randomUUID()}@example.com`,
        name: "Email test",
        passwordHash: await app.get(PasswordService).hash(password),
        emailVerifiedAt: verified ? new Date() : null,
      },
    });
    ids.push(user.id);
    const cookie = `${SESSION_COOKIE}=${await app.get(SessionService).issue(user.id, user.tokenVersion)}`;
    return { ...user, cookie };
  }
  async function issue(email: string, purpose: EmailTokenPurpose = "verify_email") {
    await post("email/request").send({ email, purpose }).expect(202);
    return latest(email);
  }
  const consume = (mail: { token: string; purpose: EmailTokenPurpose }, name?: string) =>
    post("email/confirm").send({
      token: mail.token,
      purpose: mail.purpose,
      password: replacement,
      name,
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({ send })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0, "127.0.0.1");
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    try {
      await prisma.memberKey.deleteMany({ where: { userId: { in: ids } } });
      await prisma.auditLog.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.membership.deleteMany({ where: { userId: { in: ids } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    } finally {
      await app?.close();
    }
  });

  it("registers unverified, sends mail, and exposes no token or password hash", async () => {
    const email = `register-email-${randomUUID()}@example.com`;
    const result = await post("register").send({ email, name: "Registrant", password }).expect(202);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    ids.push(user.id);
    expect(user.emailVerifiedAt).toBeNull();
    expect(result.body).toEqual({ accepted: true });
    expect(result.body).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(result.body)).not.toContain(latest(email).token);
    expect(latest(email).purpose).toBe("verify_email");
  });

  it("blocks unverified organization/invitation access including old owners and direct writes", async () => {
    const user = await account();
    const org = await prisma.organization.create({
      data: {
        name: "Legacy",
        slug: `legacy-${randomUUID()}`,
        memberships: { create: { userId: user.id, role: "owner" } },
      },
    });
    orgIds.push(org.id);
    for (const path of ["orgs", `orgs/${org.slug}`, `orgs/${org.slug}/members`, "me/invitations"]) {
      await request(app.getHttpServer())
        .get(`/api/v1/${path}`)
        .set("Cookie", user.cookie)
        .expect(403);
    }
    await request(app.getHttpServer())
      .post("/api/v1/orgs")
      .set("Cookie", user.cookie)
      .send({ name: "No", slug: "not-verified" })
      .expect(403);
    await expect(
      app.get(OrgsService).createOrg(user.id, { name: "No", slug: "not-verified" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      app.get(OrgsService).updateOrg(org.id, user.id, { name: "No" }),
    ).rejects.toMatchObject({ status: 403 });
    await consume(await issue(user.email)).expect(409);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt,
    ).toBeNull();
  });

  it("replaces a squatter password, revokes old JWTs and all tokens, then permits verified access", async () => {
    const user = await account();
    const mail = await issue(user.email);
    await issue(user.email, "reset_password");
    const stored = await prisma.emailToken.findUniqueOrThrow({
      where: { userId_purpose: { userId: user.id, purpose: "verify_email" } },
    });
    expect(stored.tokenHash).toBe(createHash("sha256").update(mail.token).digest("hex"));
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    await consume(mail).expect(422);
    await consume(mail, "  Mail owner  ").expect(204);
    expect(await prisma.emailToken.count({ where: { userId: user.id } })).toBe(0);
    await consume(mail).expect(400);
    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", user.cookie)
      .expect(401);
    await post("login").send({ email: user.email, password }).expect(401);
    const login = await post("login")
      .send({ email: user.email, password: replacement })
      .expect(200);
    expect(login.body.emailVerifiedAt).toEqual(expect.any(String));
    expect(login.body.name).toBe("Mail owner");
    const cookie = login.get("Set-Cookie")?.[0] ?? "";
    await request(app.getHttpServer())
      .get("/api/v1/me/invitations")
      .set("Cookie", cookie)
      .expect(200);
  });

  it("uses the same request response for unknown, verified and throttled accounts", async () => {
    const user = await account();
    const a = await post("email/request")
      .send({ email: user.email, purpose: "verify_email" })
      .expect(202);
    const b = await post("email/request")
      .send({ email: `missing-${randomUUID()}@example.com`, purpose: "verify_email" })
      .expect(202);
    const c = await post("email/request")
      .send({ email: user.email, purpose: "verify_email" })
      .expect(202);
    const verified = await account(true);
    const d = await post("email/request")
      .send({ email: verified.email, purpose: "verify_email" })
      .expect(202);
    expect([b.body, c.body, d.body]).toEqual([a.body, a.body, a.body]);
    expect(mailbox.filter((mail) => mail.email === user.email)).toHaveLength(1);
  });

  it("invalidates replaced tokens and rejects purpose confusion and expiry at the boundary", async () => {
    const user = await account();
    const first = await issue(user.email);
    await prisma.emailToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() + 13 * 60_000) },
    });
    const second = await issue(user.email);
    expect(second.token).not.toBe(first.token);
    await consume(first).expect(400);
    await consume({ ...second, purpose: "reset_password" }).expect(400);
    const now = Date.now();
    await prisma.emailToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(now) },
    });
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    try {
      await consume(second).expect(400);
    } finally {
      clock.mockRestore();
    }
  });

  it("allows exactly one simultaneous consumption", async () => {
    const user = await account();
    const mail = await issue(user.email);
    const responses = await Promise.all([consume(mail, "First"), consume(mail, "Second")]);
    expect(responses.map((r) => r.status).sort()).toEqual([204, 400]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).tokenVersion).toBe(1);
  });

  it("keeps an unverified password-reset token usable until the owner supplies a valid new name", async () => {
    const user = await account();
    const mail = await issue(user.email, "reset_password");
    await consume(mail).expect(422);
    await consume(mail, "   ").expect(400);
    await consume(mail, "x".repeat(51)).expect(400);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      name: user.name,
      passwordHash: user.passwordHash,
      emailVerifiedAt: null,
      tokenVersion: user.tokenVersion,
    });
    await consume(mail, "Mailbox owner").expect(204);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      name: "Mailbox owner",
      emailVerifiedAt: expect.any(Date),
      tokenVersion: user.tokenVersion + 1,
    });
  });

  it("resets verified accounts, but requires manual recovery when live keys exist", async () => {
    const user = await account(true);
    const org = await app
      .get(OrgsService)
      .createOrg(user.id, { name: "Verified", slug: `verified-${randomUUID()}` });
    orgIds.push(org.id);
    const mail = await issue(user.email, "reset_password");
    const key = await prisma.memberKey.create({
      data: {
        userId: user.id,
        orgId: org.id,
        purpose: "sign",
        publicKey: "a".repeat(64),
        fingerprint: createHash("sha256").update(user.id).digest("hex"),
        status: "active",
      },
    });
    await consume(mail).expect(409);
    await prisma.memberKey.delete({ where: { id: key.id } });
    await consume(mail, "Unrequested rename").expect(204);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe(user.name);
    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", user.cookie)
      .expect(401);
  });

  it("resets a verified password without requiring a new name", async () => {
    const user = await account(true);
    await consume(await issue(user.email, "reset_password")).expect(204);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe(user.name);
  });

  it("requires a verified target when changing a role", async () => {
    const owner = await account(true);
    const target = await account();
    const org = await app
      .get(OrgsService)
      .createOrg(owner.id, { name: "Roles", slug: `roles-${randomUUID()}` });
    orgIds.push(org.id);
    await prisma.membership.create({ data: { orgId: org.id, userId: target.id, role: "issuer" } });
    await expect(
      app.get(MembersService).changeRole(org.id, owner.id, target.id, "owner"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("changes a password only with the current password and revokes sessions and tokens", async () => {
    const user = await account(true);
    await issue(user.email, "reset_password");
    await post("password").send({ currentPassword: password, password: replacement }).expect(401);
    await post("password")
      .set("Cookie", user.cookie)
      .send({ currentPassword: "wrong-password", password: replacement })
      .expect(401);
    await post("password")
      .set("Cookie", user.cookie)
      .send({ currentPassword: password, password: replacement })
      .expect(204);
    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", user.cookie)
      .expect(401);
    expect(await prisma.emailToken.count({ where: { userId: user.id } })).toBe(0);
    await post("login").send({ email: user.email, password: replacement }).expect(200);
  });

  it("does not leave a usable token after delivery failure", async () => {
    const user = await account();
    send.mockRejectedValueOnce(new Error("SMTP unavailable"));
    await post("email/request").send({ email: user.email, purpose: "verify_email" }).expect(202);
    expect(await prisma.emailToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it("rejects malformed tokens and extra trust fields", async () => {
    await post("email/confirm")
      .send({ token: "bad", purpose: "verify_email", password: replacement })
      .expect(400);
    await post("email/request").send({ email: "bad", purpose: "verify_email" }).expect(400);
    await post("register")
      .send({
        email: "extra@example.com",
        name: "Bad",
        password,
        emailVerifiedAt: new Date().toISOString(),
      })
      .expect(400);
    await expect(
      app
        .get(EmailTokenService)
        .consume({ token: "0".repeat(64), purpose: "reset_password", password: replacement }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
