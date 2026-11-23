import { MailService } from "../src/auth/mail.service.js";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { PasswordService } from "../src/auth/password.service.js";
import { configureApp } from "../src/main.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

describe("Registration (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `register-${randomUUID()}@example.com`;
  const concurrentEmail = `concurrent-${randomUUID()}@example.com`;
  const invalidEmail = `invalid-${randomUUID()}@example.com`;
  const password = "  registration-password-🔐  ";
  const send = jest
    .fn<Promise<void>, Parameters<MailService["send"]>>()
    .mockResolvedValue(undefined);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({ send })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      await prisma?.user.deleteMany({
        where: { email: { in: [email, concurrentEmail, invalidEmail] } },
      });
    } finally {
      await app?.close();
    }
  });

  it("creates a user, normalizes email and name, and stores only the password hash", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: ` ${email.toUpperCase()} `, name: "  가입자  ", password })
      .expect(202, { accepted: true });

    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(res.headers["cache-control"]).toBe("no-store");
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user).toMatchObject({ email, name: "가입자", emailVerifiedAt: null });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    const passwords = app.get(PasswordService);
    await expect(passwords.verify(user.passwordHash, password)).resolves.toBe(true);
    await expect(passwords.verify(user.passwordHash, password.trim())).resolves.toBe(false);
  });

  it.each([false, true])(
    "preserves an existing account and rate-limits its signup notice (verified=%s)",
    async (verified) => {
      const existingEmail = `existing-${randomUUID()}@example.com`;
      const user = await prisma.user.create({
        data: {
          email: existingEmail,
          name: "원래 이름",
          passwordHash: await app.get(PasswordService).hash(password),
          emailVerifiedAt: verified ? new Date() : null,
        },
      });
      try {
        const again = () =>
          request(app.getHttpServer())
            .post("/api/v1/auth/register")
            .send({
              email: existingEmail.toUpperCase(),
              name: "다른 이름",
              password: "unrelated-password",
            })
            .expect(202, { accepted: true });
        await Promise.all([again(), again()]);
        const messages = send.mock.calls.filter(([recipient]) => recipient === existingEmail);
        expect(messages).toEqual([
          [
            existingEmail,
            expect.stringMatching(/^[a-f0-9]{64}$/),
            "reset_password",
            verified ? "verified" : "unverified",
          ],
        ]);
        const reserved = await prisma.emailToken.findUniqueOrThrow({
          where: { userId_purpose: { userId: user.id, purpose: "reset_password" } },
        });
        // Even after the one-minute send interval, a signup retry preserves a live recovery link.
        await prisma.emailToken.update({
          where: { tokenHash: reserved.tokenHash },
          data: { expiresAt: new Date(Date.now() + 5 * 60_000) },
        });
        await again();
        expect(send.mock.calls.filter(([recipient]) => recipient === existingEmail)).toHaveLength(
          1,
        );
        expect(await prisma.user.findUniqueOrThrow({ where: { email: existingEmail } })).toEqual(
          user,
        );
      } finally {
        await prisma.user.delete({ where: { id: user.id } });
      }
    },
  );

  it("accepts both concurrent signup requests and creates one account and one email", async () => {
    const responses = await Promise.all(
      [0, 1].map(() =>
        request(app.getHttpServer())
          .post("/api/v1/auth/register")
          .send({ email: concurrentEmail, name: "동시 가입", password }),
      ),
    );
    for (const res of responses) {
      expect(res.status).toBe(202);
      expect(res.body).toEqual({ accepted: true });
    }
    expect(await prisma.user.count({ where: { email: concurrentEmail } })).toBe(1);
    expect(send.mock.calls.filter(([recipient]) => recipient === concurrentEmail)).toEqual([
      [concurrentEmail, expect.any(String), "verify_email", undefined],
    ]);
  });

  it.each([
    { email: "invalid" },
    { email: 123 },
    { name: "   " },
    { name: "a".repeat(51) },
    { name: null },
    { password: "a".repeat(7) },
    { password: "a".repeat(129) },
    { password: null },
    { role: "owner" },
    { passwordHash: "injected-hash" },
  ])("rejects invalid or unauthorized fields (%#)", async (override) => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: invalidEmail, name: "가입자", password, ...override })
      .expect(400);
    expect(await prisma.user.count({ where: { email: invalidEmail } })).toBe(0);
  });

  it("rejects missing required fields", async () => {
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({}).expect(400);
  });
});
