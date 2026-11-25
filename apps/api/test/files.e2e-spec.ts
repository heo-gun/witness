import { randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { ServiceUnavailableException, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { SESSION_COOKIE } from "../src/auth/session.config.js";
import { SessionService } from "../src/auth/session.service.js";
import { CiphertextStorage } from "../src/files/ciphertext-storage.service.js";
import type { Role } from "../src/generated/prisma/client.js";
import { configureApp } from "../src/main.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

interface Actor {
  id: string;
  cookie: string;
}
const randomHex = (size: number) => randomBytes(size).toString("hex");
const max = 20 * 1024 * 1024 + 16;

describe("encrypted file transfer (e2e)", () => {
  let app: INestApplication, db: PrismaService, orgId: string;
  let issuer: Actor, signer: Actor, bystander: Actor, fingerprint: string;
  const objects = new Map<string, Buffer>();
  const storage = {
    async get(key: string) {
      const bytes = objects.get(key);
      if (!bytes) throw new ServiceUnavailableException();
      return bytes;
    },
    async put(key: string, bytes: Buffer) {
      objects.set(key, bytes);
    },
    async remove(key: string) {
      objects.delete(key);
    },
  };
  async function actor(role: Role) {
    const user = await db.user.create({
      data: {
        email: randomUUID() + "@example.test",
        name: role,
        emailVerifiedAt: new Date(),
        passwordHash: "test-fixture",
        memberships: { create: { orgId, role } },
      },
    });
    const token = await app.get(SessionService).issue(user.id, user.tokenVersion);
    return { id: user.id, cookie: SESSION_COOKIE + "=" + token };
  }
  async function fixture() {
    const doc = await db.document.create({
      data: {
        orgId,
        issuerId: issuer.id,
        category: "other",
        title: "transfer",
        fileHash: randomHex(32),
        signatureRequest: { create: { orgId, requesterId: issuer.id, signerId: signer.id } },
      },
      include: { signatureRequest: true },
    });
    if (!doc.signatureRequest) throw new Error("Missing request fixture");
    const { id, documentId } = doc.signatureRequest;
    const path = `/api/v1/signature-requests/${id}/file`;
    const headers = {
      "X-IV": randomHex(12),
      "X-Ephemeral-Public-Key": randomHex(32),
      "X-Recipient-Fingerprint": fingerprint,
    };
    return {
      id,
      documentId,
      path,
      headers,
      put: (bytes: Buffer, who = issuer) =>
        request(app.getHttpServer())
          .put(path)
          .set("Cookie", who.cookie)
          .set("Content-Type", "application/octet-stream")
          .set(headers)
          .send(bytes),
      get: (who = signer) => request(app.getHttpServer()).get(path).set("Cookie", who.cookie),
    };
  }
  beforeAll(async () => {
    const ref = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CiphertextStorage)
      .useValue(storage)
      .compile();
    app = ref.createNestApplication();
    configureApp(app);
    await app.listen(0, "127.0.0.1");
    db = app.get(PrismaService);
    orgId = (
      await db.organization.create({ data: { slug: "files-" + randomUUID(), name: "Files" } })
    ).id;
    issuer = await actor("issuer");
    signer = await actor("signer");
    bystander = await actor("signer");
  });
  beforeEach(async () => {
    fingerprint = randomHex(32);
    await db.memberKey.create({
      data: {
        userId: signer.id,
        orgId,
        purpose: "encrypt",
        status: "active",
        fingerprint,
        publicKey: randomHex(32),
      },
    });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    objects.clear();
    await db.memberKey.updateMany({
      where: { orgId, userId: signer.id, status: "active" },
      data: { status: "revoked" },
    });
  });
  afterAll(async () => {
    (app?.getHttpServer() as Server | undefined)?.closeAllConnections();
    await app?.close();
  });

  it("publishes the complete envelope and returns it only to the recipient, including the maximum size", async () => {
    const f = await fixture();
    const bytes = randomBytes(max);
    await f.get().expect(409);
    const receipt = { id: f.id, documentId: f.documentId, status: "pending" };
    await f.put(bytes).expect(200, receipt);
    const read = await f
      .get()
      .expect(200)
      .expect("Content-Type", "application/octet-stream")
      .expect("Cache-Control", "private, no-store");
    for (const [name, value] of Object.entries(f.headers))
      expect(read.headers[name.toLowerCase()]).toBe(value);
    expect(Buffer.isBuffer(read.body) && (read.body as Buffer).equals(bytes)).toBe(true);
    await f.get(issuer).expect(404);
    await f.get(bystander).expect(404);
    expect(await db.logEntry.count({ where: { documentId: f.documentId } })).toBe(0);
  });

  it("enforces identity, media type, metadata and size before staging bytes", async () => {
    const f = await fixture();
    const bytes = Buffer.alloc(16);
    await request(app.getHttpServer()).get(f.path).expect(401);
    await f.put(bytes, signer).expect(404);
    await f.put(bytes).set("x-expected-user-id", bystander.id).expect(412);
    await f.put(bytes).set("sec-fetch-site", "cross-site").expect(403);
    await f.put(bytes).set("Content-Type", "text/plain").expect(415);
    await f.put(bytes).set("Content-Encoding", "gzip").expect(415);
    await f.put(bytes).set("X-IV", "A".repeat(24)).expect(400);
    await f.put(bytes).set("X-Recipient-Fingerprint", randomHex(32)).expect(409);
    await f.put(Buffer.alloc(15)).expect(400);
    const streamed = request(app.getHttpServer())
      .put(f.path)
      .set(f.headers)
      .set("Cookie", issuer.cookie)
      .set("Content-Type", "application/octet-stream")
      .set("Transfer-Encoding", "chunked");
    streamed.write(bytes);
    await streamed.expect(411);
    await f
      .put(Buffer.alloc(max + 1))
      .set("Connection", "keep-alive")
      .expect(413);
    expect(await db.encryptedFile.count({ where: { requestId: f.id } })).toBe(0);
    await f.put(bytes).expect(200);
  });

  it("acknowledges an identical retry and refuses to replace a delivered file", async () => {
    const f = await fixture();
    const bytes = randomBytes(20);
    const [a, b] = await Promise.all([f.put(bytes), f.put(bytes)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(objects.size).toBe(1);
    await f.put(randomBytes(20)).expect(409);
    await f.put(bytes).set("X-IV", randomHex(12)).expect(409);
    expect((await f.get().expect(200)).body).toEqual(bytes);
  });

  it("keeps an interrupted write inaccessible, then recovers on the same request", async () => {
    const f = await fixture();
    const bytes = randomBytes(32);
    jest.spyOn(storage, "put").mockRejectedValueOnce(new ServiceUnavailableException());
    await f.put(bytes).expect(503);
    await f.get().expect(409);
    await f.put(bytes).expect(200);
    expect((await f.get().expect(200)).body).toEqual(bytes);
  });

  it("refuses to publish if the issuer session changes during storage", async () => {
    const f = await fixture();
    const bytes = randomBytes(32);
    jest.spyOn(storage, "put").mockImplementationOnce(async (key, data) => {
      objects.set(key, data);
      await app.get(SessionService).revokeAll(issuer.id);
    });
    try {
      await f.put(bytes).expect(401);
      await f.get().expect(409);
    } finally {
      const user = await db.user.findUniqueOrThrow({ where: { id: issuer.id } });
      issuer.cookie =
        SESSION_COOKIE + "=" + (await app.get(SessionService).issue(user.id, user.tokenVersion));
    }
    await f.put(bytes).expect(200);
  });

  it("rechecks the recipient key after storage and accepts a replacement encryption key", async () => {
    const f = await fixture();
    const bytes = randomBytes(32);
    const newFingerprint = randomHex(32);
    jest.spyOn(storage, "put").mockImplementationOnce(async (key, data) => {
      objects.set(key, data);
      await db.memberKey.update({ where: { fingerprint }, data: { status: "revoked" } });
    });
    await f.put(bytes).expect(409);
    await f.get().expect(409);
    await db.memberKey.create({
      data: {
        orgId,
        userId: signer.id,
        purpose: "encrypt",
        status: "active",
        publicKey: randomHex(32),
        fingerprint: newFingerprint,
      },
    });
    const replaced = randomBytes(48);
    await f.put(replaced).set("X-Recipient-Fingerprint", newFingerprint).expect(200);
    expect(objects.size).toBe(1);
    expect((await f.get().expect(200)).body).toEqual(replaced);
    await db.signatureRequest.update({ where: { id: f.id }, data: { status: "needs_resend" } });
    await f.get().expect(409);
    await f.put(bytes).set("X-Recipient-Fingerprint", newFingerprint).expect(200);
    expect(objects.size).toBe(1);
    expect((await f.get().expect(200)).body).toEqual(bytes);
  });

  it("a superseded writer finishing late cannot replace a delivered object", async () => {
    const f = await fixture();
    let started!: () => void, finish!: () => void;
    const writing = new Promise<void>((resolve) => {
      started = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      finish = resolve;
    });
    jest.spyOn(storage, "put").mockImplementationOnce(async (key, bytes) => {
      started();
      await wait;
      objects.set(key, bytes);
    });
    const first = f.put(randomBytes(20)).then((r) => r.status);
    const replacement = randomBytes(20);
    try {
      await writing;
      await f.put(replacement).expect(200);
    } finally {
      finish();
    }
    expect(await first).toBe(409);
    expect(objects.size).toBe(1);
    expect((await f.get().expect(200)).body).toEqual(replacement);
  });

  it("withholds an in-flight download if the recipient key is revoked", async () => {
    const f = await fixture();
    const bytes = randomBytes(24);
    await f.put(bytes).expect(200);
    jest.spyOn(storage, "get").mockImplementationOnce(async () => {
      await db.memberKey.update({ where: { fingerprint }, data: { status: "revoked" } });
      return bytes;
    });
    await f.get().expect(409).expect("Content-Type", /json/);
  });
});
