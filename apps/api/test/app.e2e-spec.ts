import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/main.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

describe("App bootstrap (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves routes under /api/v1 and returns a JSON 404 for unknown paths", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/unknown").expect(404);
    expect(res.body).toMatchObject({ statusCode: 404 });
  });

  it("connects to the database", async () => {
    const prisma = app.get(PrismaService);
    await expect(prisma.user.count()).resolves.toBeGreaterThanOrEqual(0);
  });
});
