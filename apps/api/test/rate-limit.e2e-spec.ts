import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { SESSION_COOKIE } from "../src/auth/session.config.js";
import { SessionService } from "../src/auth/session.service.js";
import { configureApp } from "../src/main.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

describe("Rate limits (real Guards and storage)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let cookie: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0, "127.0.0.1");
    prisma = app.get(PrismaService);
    const user = await prisma.user.create({
      data: {
        email: `ratetest-${randomUUID()}@example.com`,
        name: "Rate test",
        passwordHash: "unused",
      },
    });
    userId = user.id;
    cookie = `${SESSION_COOKIE}=${await app.get(SessionService).issue(user.id, user.tokenVersion)}`;
  });

  afterAll(async () => {
    try {
      if (userId) await prisma.user.delete({ where: { id: userId } });
    } finally {
      await app?.close();
    }
  });

  it.each([
    ["auth/login", 10],
    ["auth/register", 5],
    ["invitations/invalid/accept", 20],
    ["invitations/invalid/decline", 20],
  ] as const)(
    "limits %s across concurrent requests and forged proxy headers",
    async (route, limit) => {
      const results = await Promise.all(
        Array.from({ length: limit + 1 }, (_, index) =>
          request(app.getHttpServer())
            .post(`/api/v1/${route}`)
            .set("Cookie", cookie)
            .set("X-Forwarded-For", `192.0.2.${index + 1}`)
            .send({}),
        ),
      );
      expect(results.filter((res) => res.status === 400)).toHaveLength(limit);
      const blocked = results.filter((res) => res.status === 429);
      expect(blocked).toHaveLength(1);
      expect(Number(blocked[0]?.headers["retry-after"])).toBeGreaterThan(0);
      await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookie).expect(200);
      const now = Date.now();
      const clock = jest.spyOn(Date, "now").mockReturnValue(now + 60_001);
      try {
        await request(app.getHttpServer())
          .post(`/api/v1/${route}`)
          .set("Cookie", cookie)
          .send({})
          .expect(400);
      } finally {
        clock.mockRestore();
      }
    },
  );
});
