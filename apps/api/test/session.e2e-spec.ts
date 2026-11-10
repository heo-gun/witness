import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { SESSION_COOKIE } from "../src/auth/session.config.js";
import { configureApp } from "../src/main.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

describe("Authentication sessions (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let userId: string;
  let sessionCookie: string;
  const email = `session-${randomUUID()}@example.com`;
  const password = "  session-password-🔐  ";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, name: "세션 사용자", password })
      .expect(201);
    userId = String(res.body.id);
  });

  afterAll(async () => {
    try {
      await prisma?.user.deleteMany({ where: { email } });
    } finally {
      await app?.close();
    }
  });

  it("logs in and returns public user data with an httpOnly session cookie", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: ` ${email.toUpperCase()} `, password })
      .expect(200);

    expect(res.body).toEqual({
      id: userId,
      email,
      name: "세션 사용자",
      createdAt: expect.any(String),
    });
    expect(res.headers["cache-control"]).toBe("no-store");
    const cookies: unknown = res.headers["set-cookie"];
    if (!Array.isArray(cookies) || typeof cookies[0] !== "string") {
      throw new Error("Expected a session cookie");
    }
    const header = cookies[0];
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/api/v1");
    expect(header).toContain("Max-Age=3600");
    sessionCookie = header.split(";")[0] ?? "";
    const token = sessionCookie.slice(`${SESSION_COOKIE}=`.length);
    const payload = await jwt.verifyAsync<Record<string, unknown>>(token);
    expect(payload.sub).toBe(userId);
    expect(Number(payload.exp) - Number(payload.iat)).toBe(3600);
    expect(payload).not.toHaveProperty("email");
    expect(payload).not.toHaveProperty("passwordHash");
  });

  it("returns the current user through the cookie Guard and @CurrentUser", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", sessionCookie)
      .expect(200);
    expect(res.body).toEqual({
      id: userId,
      email,
      name: "세션 사용자",
      createdAt: expect.any(String),
    });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it.each([
    { password: "incorrect-password" },
    { password: password.trim() },
    { email: `missing-${randomUUID()}@example.com` },
  ])("rejects invalid credentials with a generic 401 and no cookie (%#)", async (override) => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password, ...override })
      .expect(401);
    expect(res.body.message).toBe("Invalid email or password");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it.each([
    {},
    { email: "invalid", password },
    { email, password: 123 },
    { email, password, role: "owner" },
  ])("validates login input (%#)", async (input) => {
    await request(app.getHttpServer()).post("/api/v1/auth/login").send(input).expect(400);
  });

  it.each(["login", "register", "logout"])("rejects form submissions to %s", async (action) => {
    await request(app.getHttpServer())
      .post(`/api/v1/auth/${action}`)
      .type("form")
      .send({ email, password })
      .expect(415);
  });

  it.each(["login", "register", "logout"])("rejects cross-site POST to %s", async (action) => {
    await request(app.getHttpServer())
      .post(`/api/v1/auth/${action}`)
      .set("Sec-Fetch-Site", "cross-site")
      .send({ email, password })
      .expect(403);
  });

  it("requires a cookie for me and logout", async () => {
    await request(app.getHttpServer()).get("/api/v1/auth/me").expect(401);
    await request(app.getHttpServer()).post("/api/v1/auth/logout").send({}).expect(401);
  });

  it.each(["not-a-token", "%E0%A4%A", ""])(
    "rejects malformed session cookies (%#)",
    async (token) => {
      await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Cookie", `${SESSION_COOKIE}=${token}`)
        .expect(401);
    },
  );

  it("rejects expired, wrongly signed, wrong-issuer, wrong-audience and wrong-algorithm tokens", async () => {
    const tokens = await Promise.all([
      jwt.signAsync({ sub: userId }, { expiresIn: -1 }),
      jwt.signAsync({ sub: userId }, { secret: "a-different-secret-at-least-32-bytes" }),
      jwt.signAsync({ sub: userId }, { issuer: "other-api" }),
      jwt.signAsync({ sub: userId }, { audience: "other-app" }),
      jwt.signAsync({ sub: userId }, { algorithm: "HS384" }),
    ]);
    for (const token of tokens) {
      await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Cookie", `${SESSION_COOKIE}=${token}`)
        .expect(401);
    }
  });

  it("rejects missing expiry, missing or invalid subject, and nonexistent users", async () => {
    const noExpiryJwt = new JwtService({
      secret: process.env.JWT_SECRET,
      signOptions: { issuer: "tlog-api", audience: "tlog-web", algorithm: "HS256" },
    });
    const tokens = await Promise.all([
      noExpiryJwt.signAsync({ sub: userId }),
      jwt.signAsync({}),
      jwt.signAsync({ sub: "invalid-user-id" }),
      jwt.signAsync({ sub: randomUUID() }),
    ]);
    for (const token of tokens) {
      await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Cookie", `${SESSION_COOKIE}=${token}`)
        .expect(401);
    }
  });

  it("expires the browser cookie on logout and leaves the browser unauthenticated", async () => {
    const browser = request.agent(app.getHttpServer());
    await browser.post("/api/v1/auth/login").send({ email, password }).expect(200);
    await browser.get("/api/v1/auth/me").expect(200);
    const res = await browser.post("/api/v1/auth/logout").send({}).expect(204);
    const cookies: unknown = res.headers["set-cookie"];
    if (!Array.isArray(cookies) || typeof cookies[0] !== "string") {
      throw new Error("Expected an expired session cookie");
    }
    expect(cookies[0]).toContain(`${SESSION_COOKIE}=;`);
    expect(cookies[0]).toContain("Expires=Thu, 01 Jan 1970");
    expect(cookies[0]).toContain("Path=/api/v1");
    expect(cookies[0]).toContain("HttpOnly");
    await browser.get("/api/v1/auth/me").expect(401);
  });
});
