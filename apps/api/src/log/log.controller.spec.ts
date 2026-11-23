import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { leafHash, rootFromLeafHashes, verifyConsistency, verifyInclusion } from "@tlog/merkle";
import { bytesToHex, hexToBytes } from "@tlog/shared";
import request from "supertest";
import { configureApp } from "../main.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { LogReadService } from "./log-read.service.js";
import { LogController } from "./log.controller.js";

describe("public log HTTP API", () => {
  let app: INestApplication;
  const treeHead = { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() };
  const logEntry = { findMany: jest.fn() };
  const url = "/api/v1/log";
  const get = (path: string) => request(app.getHttpServer()).get(url + path);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LogController],
      providers: [LogReadService, { provide: PrismaService, useValue: { treeHead, logEntry } }],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.resetAllMocks());

  it("serves an empty head and history before the first append", async () => {
    treeHead.findFirst.mockResolvedValue(null);
    treeHead.findMany.mockResolvedValue([]);
    await get("/sth").expect(204).expect("");
    await get("/sth/history").expect(200, []);
  });

  it("serves signed heads and pages backwards by tree size", async () => {
    const head = {
      treeSize: 7,
      timestamp: new Date(),
      rootHash: "ab".repeat(32),
      signature: "cd".repeat(64),
    };
    const json = { ...head, timestamp: head.timestamp.toISOString() };
    treeHead.findFirst.mockResolvedValue(head);
    await get("/sth").expect(200, json);
    const select = { treeSize: true, timestamp: true, rootHash: true, signature: true };
    expect(treeHead.findFirst).toHaveBeenCalledWith({ select, orderBy: { treeSize: "desc" } });
    treeHead.findMany.mockResolvedValue([head]);
    await get("/sth/history?before=8").expect(200, [json]);
    expect(treeHead.findMany).toHaveBeenCalledWith({
      where: { treeSize: { lt: 8 } },
      select,
      orderBy: { treeSize: "desc" },
      take: 100,
    });
  });

  it("returns the original entry text for an inclusive range", async () => {
    const entryJson = '{"title":"결산"}';
    const bytes = Buffer.from(entryJson);
    const entry = {
      leafIndex: 1,
      type: "ISSUE",
      documentId: "doc",
      leafHash: bytesToHex(leafHash(bytes)),
    };
    logEntry.findMany.mockResolvedValue([{ ...entry, entryBytes: bytes }]);
    await get("/entries?start=1&end=1").expect(200, [{ ...entry, entryJson }]);
    expect(logEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { leafIndex: { gte: 1, lte: 1 } },
        orderBy: { leafIndex: "asc" },
        take: 100,
      }),
    );
  });

  it("returns verifiable inclusion and consistency paths for the requested prefix", async () => {
    const hashes = [1, 2, 3].map((n) => leafHash(Uint8Array.of(n)));
    const root = rootFromLeafHashes(hashes);
    logEntry.findMany.mockResolvedValue(hashes.map((h) => ({ leafHash: bytesToHex(h) })));
    treeHead.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const inclusion = await get("/proof/inclusion?leafIndex=1&treeSize=3").expect(200);
    const { auditPath } = inclusion.body as { auditPath: string[] };
    expect(
      verifyInclusion({
        leafIndex: 1,
        treeSize: 3,
        leafHash: leafHash(Uint8Array.of(2)),
        rootHash: root,
        proof: auditPath.map((h) => hexToBytes(h)),
      }),
    ).toBe(true);
    const consistency = await get("/proof/consistency?first=2&second=3").expect(200);
    const { proof } = consistency.body as { proof: string[] };
    expect(
      verifyConsistency({
        firstSize: 2,
        secondSize: 3,
        firstRoot: rootFromLeafHashes(hashes.slice(0, 2)),
        secondRoot: root,
        proof: proof.map((h) => hexToBytes(h)),
      }),
    ).toBe(true);
    expect(logEntry.findMany).toHaveBeenCalledWith({
      where: { leafIndex: { gte: 0, lt: 3 } },
      orderBy: { leafIndex: "asc" },
      select: { leafHash: true },
    });
  });

  it("handles equal sizes and rejects unpublished heads before reading leaves", async () => {
    treeHead.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await get("/proof/consistency?first=2&second=2").expect(200, {
      first: 2,
      second: 2,
      proof: [],
    });
    await get("/proof/inclusion?leafIndex=1&treeSize=3").expect(404);
    await get("/proof/consistency?first=1&second=3").expect(404);
    expect(logEntry.findMany).not.toHaveBeenCalled();
  });

  it.each([
    "/proof/inclusion?leafIndex=1",
    "/proof/inclusion?leafIndex=-1&treeSize=1",
    "/proof/inclusion?leafIndex=1&treeSize=1",
    "/proof/consistency?first=0&second=3",
    "/proof/consistency?first=3&second=2",
    "/entries?start=1&end=0",
    "/entries?start=0&end=100",
    "/entries?start=",
    "/entries?start=0&start=1",
    "/entries?start=1e2",
    "/entries?unexpected=0",
    "/sth/history?before=2147483648",
  ])("rejects malformed query %s", async (path) => {
    await get(path).expect(400);
  });
});
