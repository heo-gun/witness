import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
      .expect(201);

    expect(res.body).toEqual({
      id: expect.any(String),
      email,
      name: "가입자",
      createdAt: expect.any(String),
    });
    expect(res.headers["set-cookie"]).toBeUndefined();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    const passwords = app.get(PasswordService);
    await expect(passwords.verify(user.passwordHash, password)).resolves.toBe(true);
    await expect(passwords.verify(user.passwordHash, password.trim())).resolves.toBe(false);
  });

  it("returns 409 for an existing normalized email", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: email.toUpperCase(), name: "중복", password })
      .expect(409);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it("allows only one of two simultaneous registrations with the same email", async () => {
    const responses = await Promise.all(
      [0, 1].map(() =>
        request(app.getHttpServer())
          .post("/api/v1/auth/register")
          .send({ email: concurrentEmail, name: "동시 가입", password }),
      ),
    );
    expect(responses.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(await prisma.user.count({ where: { email: concurrentEmail } })).toBe(1);
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
