import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { SESSION_COOKIE } from "../src/auth/session.config.js";
import { configureApp } from "../src/main.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

interface Actor {
  id: string;
  cookie: string;
}

describe("Organizations and roles (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: Actor;
  let signer: Actor;
  let issuer: Actor;
  let outsider: Actor;
  let orgId: string;
  let created: Record<string, unknown>;
  const prefix = `orgtest-${randomUUID()}`;
  const slug = `${prefix}-main`;
  const otherSlug = `${prefix}-other`;
  const userIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    const makeActor = async (label: string): Promise<Actor> => {
      const user = await prisma.user.create({
        data: {
          email: `${prefix}-${label}@example.com`,
          name: label,
          passwordHash: "unused-fixture-hash",
        },
      });
      userIds.push(user.id);
      return { id: user.id, cookie: `${SESSION_COOKIE}=${await jwt.signAsync({ sub: user.id })}` };
    };
    owner = await makeActor("owner");
    signer = await makeActor("signer");
    issuer = await makeActor("issuer");
    outsider = await makeActor("outsider");

    const res = await request(app.getHttpServer())
      .post("/api/v1/orgs")
      .set("Cookie", owner.cookie)
      .send({
        name: "  테스트 학생회  ",
        slug: ` ${slug.toUpperCase()} `,
        description: "  기관 소개  ",
      })
      .expect(201);
    created = res.body as Record<string, unknown>;
    orgId = String(created.id);
    await prisma.membership.createMany({
      data: [
        { orgId, userId: signer.id, role: "signer" },
        { orgId, userId: issuer.id, role: "issuer" },
      ],
    });
    await prisma.organization.create({
      data: {
        name: "다른 기관",
        slug: otherSlug,
        memberships: { create: { userId: outsider.id, role: "owner" } },
      },
    });
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.membership.deleteMany({ where: { org: { slug: { startsWith: prefix } } } });
        await prisma.organization.deleteMany({ where: { slug: { startsWith: prefix } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await app?.close();
    }
  });

  it("creates the organization and its owner membership together and returns public fields", async () => {
    expect(created).toEqual({
      id: expect.any(String),
      name: "테스트 학생회",
      slug,
      description: "기관 소개",
      externalId: null,
      createdAt: expect.any(String),
    });
    expect(
      await prisma.membership.findUnique({ where: { userId_orgId: { userId: owner.id, orgId } } }),
    ).toMatchObject({ role: "owner" });
  });

  it("lists only the caller's organizations and returns an empty list for a user with no memberships", async () => {
    const mine = await request(app.getHttpServer())
      .get("/api/v1/orgs")
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(mine.body).toEqual([created]);
    expect(mine.headers["cache-control"]).toBe("no-store");
    const other = await request(app.getHttpServer())
      .get("/api/v1/orgs")
      .set("Cookie", outsider.cookie)
      .expect(200);
    expect(other.body).toEqual([expect.objectContaining({ slug: otherSlug })]);
    const emptyUser = await prisma.user.create({
      data: {
        email: `${prefix}-empty@example.com`,
        name: "empty",
        passwordHash: "unused-fixture-hash",
      },
    });
    userIds.push(emptyUser.id);
    const token = await app.get(JwtService).signAsync({ sub: emptyUser.id });
    const empty = await request(app.getHttpServer())
      .get("/api/v1/orgs")
      .set("Cookie", `${SESSION_COOKIE}=${token}`)
      .expect(200);
    expect(empty.body).toEqual([]);
  });

  it.each(["owner", "signer", "issuer"] as const)(
    "allows %s to read organization details",
    async (role) => {
      const actor = { owner, signer, issuer }[role];
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${slug}`)
        .set("Cookie", actor.cookie)
        .expect(200);
      expect(res.body).toEqual(created);
      expect(res.headers["cache-control"]).toBe("no-store");
    },
  );

  it("denies a non-member, even when they own another organization", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/orgs/${slug}`)
      .set("Cookie", outsider.cookie)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/orgs/${slug}`)
      .set("Cookie", outsider.cookie)
      .send({ name: "공격" })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/orgs/${otherSlug}`)
      .set("Cookie", owner.cookie)
      .expect(403);
  });

  it("requires authentication for all four endpoints", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/orgs")
      .send({ name: "익명", slug })
      .expect(401);
    await request(app.getHttpServer()).get("/api/v1/orgs").expect(401);
    await request(app.getHttpServer()).get(`/api/v1/orgs/${slug}`).expect(401);
    await request(app.getHttpServer())
      .patch(`/api/v1/orgs/${slug}`)
      .send({ name: "익명" })
      .expect(401);
  });

  it("returns 409 on a normalized duplicate slug without creating an extra membership", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/orgs")
      .set("Cookie", outsider.cookie)
      .send({ name: "중복", slug: slug.toUpperCase() })
      .expect(409);
    expect(await prisma.organization.count({ where: { slug } })).toBe(1);
    expect(await prisma.membership.count({ where: { orgId, userId: outsider.id } })).toBe(0);
  });

  it("permits only one concurrent creation of a slug with exactly one owner membership", async () => {
    const concurrentSlug = `${prefix}-race`;
    const results = await Promise.all(
      [owner, outsider].map((actor) =>
        request(app.getHttpServer())
          .post("/api/v1/orgs")
          .set("Cookie", actor.cookie)
          .send({ name: "동시 생성", slug: concurrentSlug }),
      ),
    );
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    const org = await prisma.organization.findUniqueOrThrow({
      where: { slug: concurrentSlug },
      include: { memberships: true },
    });
    expect(org.memberships).toHaveLength(1);
    expect(org.memberships[0]?.role).toBe("owner");
    const winnerIndex = results.findIndex((res) => res.status === 201);
    expect(org.memberships[0]?.userId).toBe([owner, outsider][winnerIndex]?.id);
  });

  it.each([
    {},
    { name: "  ", slug: `${prefix}-invalid` },
    { name: "x".repeat(101), slug: `${prefix}-invalid` },
    { name: "기관", slug: "../escape" },
    { name: "기관", slug: "with space" },
    { name: "기관", slug: "-bad-slug" },
    { name: "기관", slug: "a".repeat(65) },
    { name: "기관", slug: `${prefix}-invalid`, description: "x".repeat(501) },
    { name: "기관", slug: `${prefix}-invalid`, description: null },
    { name: "기관", slug: `${prefix}-invalid`, role: "owner" },
    { name: "기관", slug: `${prefix}-invalid`, externalId: "injected" },
  ])("validates create input and forbids unauthorized fields (%#)", async (input) => {
    await request(app.getHttpServer())
      .post("/api/v1/orgs")
      .set("Cookie", owner.cookie)
      .send(input)
      .expect(400);
  });

  it.each(["signer", "issuer"] as const)("denies updates by %s", async (role) => {
    await request(app.getHttpServer())
      .patch(`/api/v1/orgs/${slug}`)
      .set("Cookie", { signer, issuer }[role].cookie)
      .send({ name: "권한 없음" })
      .expect(403);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })).name).toBe(
      "테스트 학생회",
    );
  });

  it("allows the owner to update the name and description while preserving the slug", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/orgs/${slug}`)
      .set("Cookie", owner.cookie)
      .send({ name: "  새 학생회  ", description: "  새 설명  " })
      .expect(200);
    expect(res.body).toEqual({ ...created, name: "새 학생회", description: "새 설명" });
    const refreshed = await request(app.getHttpServer())
      .get(`/api/v1/orgs/${slug}`)
      .set("Cookie", signer.cookie)
      .expect(200);
    expect(refreshed.body).toEqual(res.body);
  });

  it("supports clearing the description with a partial update", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/orgs/${slug}`)
      .set("Cookie", owner.cookie)
      .send({ description: "" })
      .expect(200);
    expect(res.body).toMatchObject({ name: "새 학생회", description: "", slug });
  });

  it.each([
    {},
    { name: " " },
    { name: null },
    { description: null },
    { name: "x".repeat(101) },
    { description: "x".repeat(501) },
    { slug: "replacement" },
    { externalId: "replacement" },
    { role: "owner" },
  ])("validates updates and forbids changes to protected fields (%#)", async (input) => {
    await request(app.getHttpServer())
      .patch(`/api/v1/orgs/${slug}`)
      .set("Cookie", owner.cookie)
      .send(input)
      .expect(400);
  });

  it("rechecks the current membership role rather than trusting an earlier session", async () => {
    await prisma.membership.update({
      where: { userId_orgId: { userId: owner.id, orgId } },
      data: { role: "issuer" },
    });
    try {
      await request(app.getHttpServer())
        .patch(`/api/v1/orgs/${slug}`)
        .set("Cookie", owner.cookie)
        .send({ name: "강등 후 수정" })
        .expect(403);
    } finally {
      await prisma.membership.update({
        where: { userId_orgId: { userId: owner.id, orgId } },
        data: { role: "owner" },
      });
    }
    await prisma.membership.delete({ where: { userId_orgId: { userId: issuer.id, orgId } } });
    await request(app.getHttpServer())
      .get(`/api/v1/orgs/${slug}`)
      .set("Cookie", issuer.cookie)
      .expect(403);
  });

  it("returns 404 for a nonexistent organization and 400 for an invalid slug", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/orgs/${prefix}-missing`)
      .set("Cookie", owner.cookie)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/orgs/${prefix}-missing`)
      .set("Cookie", owner.cookie)
      .send({ name: "없음" })
      .expect(404);
    await request(app.getHttpServer())
      .get("/api/v1/orgs/invalid_slug")
      .set("Cookie", owner.cookie)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/orgs/${"x".repeat(65)}`)
      .set("Cookie", owner.cookie)
      .expect(400);
  });

  it("rejects cross-site and non-JSON writes", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/orgs")
      .set("Cookie", owner.cookie)
      .set("Sec-Fetch-Site", "cross-site")
      .send({ name: "기관", slug: `${prefix}-cross` })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/orgs/${slug}`)
      .set("Cookie", owner.cookie)
      .set("Sec-Fetch-Site", "cross-site")
      .send({ name: "변경" })
      .expect(403);
    await request(app.getHttpServer())
      .post("/api/v1/orgs")
      .set("Cookie", owner.cookie)
      .type("form")
      .send({ name: "기관", slug: `${prefix}-form` })
      .expect(415);
  });
});
