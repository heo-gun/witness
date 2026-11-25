import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { createInclusionProof, leafHash, rootFromLeafHashes } from "@tlog/merkle";
import { bytesToHex, canonicalBytes, canonicalize } from "@tlog/shared";
import { MissingTreeHeadError, verifyPublicDocuments } from "../src/lib/crypto/verify.ts";

const hash = "aa".repeat(32);
const timestamp = "2026-11-25T00:00:00.000Z";

function identity(person) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
  return {
    person,
    key: raw.toString("hex"),
    fingerprint: createHash("sha256").update(raw).digest("hex"),
    sign: (payload) => sign(null, canonicalBytes(payload), privateKey).toString("hex"),
  };
}

const log = identity("log");
const anna = identity("anna");
const bo = identity("bo");
const orgId = "org";
const documentId = "doc";

function register(signer, overrides = {}) {
  return {
    type: "KEY_REGISTER",
    orgId,
    userId: signer.person,
    purpose: "sign",
    publicKey: signer.key,
    fingerprint: signer.fingerprint,
    approvedBy: "owner",
    approvedAt: timestamp,
    ...overrides,
  };
}

function revokeKey(signer) {
  return {
    type: "KEY_REVOKE",
    orgId,
    fingerprint: signer.fingerprint,
    revokedBy: "owner",
    revokedAt: timestamp,
    reason: "교체",
  };
}

function signed(action, signer, overrides = {}) {
  const fields =
    action === "ISSUE"
      ? { title: "회의록", category: "agenda", fileHash: hash }
      : { targetLeafIndex: 1, reason: "새 문서로 대체" };
  const payload = {
    action,
    orgId,
    documentId,
    signerId: signer.person,
    signerKeyFingerprint: signer.fingerprint,
    signedAt: timestamp,
    ...fields,
    ...overrides,
  };
  return { payload, signature: signer.sign(payload) };
}

function candidate(id = documentId, org = orgId, issueIndex = 1, signer = anna) {
  return {
    id,
    fileHash: hash,
    title: "회의록",
    category: "agenda",
    status: "valid",
    org: { id: org, slug: org, name: org },
    issue: { leafIndex: issueIndex, signer: { id: signer.person, name: signer.person } },
    revocation: null,
  };
}

function serve(t, entries, tamper = (body) => body) {
  const previous = process.env.NEXT_PUBLIC_LOG_PUBLIC_KEY;
  process.env.NEXT_PUBLIC_LOG_PUBLIC_KEY = log.key;
  t.after(() => {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_LOG_PUBLIC_KEY;
    else process.env.NEXT_PUBLIC_LOG_PUBLIC_KEY = previous;
  });
  const hashes = entries.map((entry) => leafHash(canonicalBytes(entry)));
  const rows = entries.map((entry, i) => ({
    type: entry.type ?? entry.payload.action,
    documentId: entry.payload?.documentId ?? null,
    leafIndex: i,
    entryJson: canonicalize(entry),
    leafHash: bytesToHex(hashes[i]),
  }));
  const head = {
    treeSize: rows.length,
    timestamp,
    rootHash: bytesToHex(rootFromLeafHashes(hashes)),
  };
  const requests = [];
  t.mock.method(globalThis, "fetch", async (path) => {
    const url = new URL(path, "http://localhost");
    const route = url.pathname.slice("/api/v1/log/".length);
    const n = (query) => Number(url.searchParams.get(query));
    requests.push(url.pathname + url.search);
    let body;
    if (route === "sth") {
      if (!rows.length) return new Response(null, { status: 204 });
      body = { ...head, signature: log.sign(head) };
    } else if (route === "entries") {
      body = rows.slice(n("start"), n("end") + 1);
    } else {
      assert.equal(route, "proof/inclusion");
      const leafIndex = n("leafIndex");
      body = {
        leafIndex,
        treeSize: n("treeSize"),
        auditPath: createInclusionProof(hashes, leafIndex).map(bytesToHex),
      };
    }
    return Response.json(tamper(body, route));
  });
  return requests;
}

test("two organizations issuing the same bytes remain independently verifiable", async (t) => {
  const secondOrg = "other";
  const secondId = "other-doc";
  const entries = [
    register(anna),
    signed("ISSUE", anna),
    revokeKey(anna),
    register(bo, { orgId: secondOrg }),
    signed("ISSUE", bo, { documentId: secondId, orgId: secondOrg }),
  ];
  serve(t, entries);
  const docs = [candidate(), candidate(secondId, secondOrg, 4, bo)];
  const result = await verifyPublicDocuments(hash, docs);
  assert.equal(result.head.treeSize, 5);
  assert.deepEqual(
    result.documents.map((doc) => doc.document),
    docs,
  );
  assert.ok(result.documents.every((doc) => doc.issue.auditPath.length > 0 && !doc.revocation));
  await assert.rejects(verifyPublicDocuments(hash, [docs[0]]));
  await assert.rejects(verifyPublicDocuments(hash, [docs[0], docs[0]]));
});

test("revocation preserves the issue, and a later key revocation preserves both signatures", async (t) => {
  const issue = signed("ISSUE", anna);
  const revoke = signed("REVOKE", bo);
  serve(t, [register(anna), issue, revokeKey(anna), register(bo), revoke, revokeKey(bo)]);
  const revoked = {
    ...candidate(),
    status: "revoked",
    revocation: { leafIndex: 4, signer: { id: bo.person, name: "Bo" } },
  };
  const {
    documents: [result],
  } = await verifyPublicDocuments(hash, [revoked]);
  assert.deepEqual(result.issue.payload, issue.payload);
  assert.equal(result.revocation.entryJson, canonicalize(revoke));
  assert.ok(result.revocation.auditPath.length);
  await assert.rejects(verifyPublicDocuments(hash, [candidate()]));
});

test("absence requires the complete signed snapshot, including the last partial page", async (t) => {
  const entries = Array.from({ length: 101 }, (_, i) => ({
    ...revokeKey(anna),
    fingerprint: i.toString(16).padStart(64, "0"),
  }));
  const requests = serve(t, entries);
  assert.deepEqual((await verifyPublicDocuments(hash, [])).documents, []);
  assert.ok(requests.includes("/api/v1/log/entries?start=100&end=100"));
});

test("an unsigned empty log cannot establish absence", async (t) => {
  serve(t, []);
  await assert.rejects(verifyPublicDocuments(hash, []), MissingTreeHeadError);
});

test("a member's replacement key becomes valid only after the previous key was revoked", async (t) => {
  const replacement = register(bo, { userId: anna.person });
  const issue = signed("ISSUE", bo, { signerId: anna.person });
  await t.test("two simultaneous active signing keys", async (s) => {
    serve(s, [register(anna), replacement, issue]);
    await assert.rejects(verifyPublicDocuments(hash, [candidate(documentId, orgId, 2)]));
  });
  await t.test("ordered rotation", async (s) => {
    serve(s, [register(anna), revokeKey(anna), replacement, issue]);
    const result = await verifyPublicDocuments(hash, [candidate(documentId, orgId, 3)]);
    assert.equal(result.documents[0].issue.payload.signerKeyFingerprint, bo.fingerprint);
  });
});

test("missing, unpinned or substituted log key fails", async (t) => {
  serve(t, [register(anna)]);
  for (const pin of ["", bo.key, log.key.toUpperCase()]) {
    process.env.NEXT_PUBLIC_LOG_PUBLIC_KEY = pin;
    await assert.rejects(verifyPublicDocuments(hash, []));
  }
});

for (const [label, entries] of [
  ["no key approval", [revokeKey(bo), signed("ISSUE", anna)]],
  ["encryption key", [register(anna, { purpose: "encrypt" }), signed("ISSUE", anna)]],
  ["key from another member", [register(anna, { userId: bo.person }), signed("ISSUE", anna)]],
  ["key from another organization", [register(anna, { orgId: "other" }), signed("ISSUE", anna)]],
  ["wrong public key fingerprint", [register(anna, { publicKey: bo.key }), signed("ISSUE", anna)]],
  [
    "wrong signing key",
    [
      register(anna),
      signed("ISSUE", bo, { signerId: anna.person, signerKeyFingerprint: anna.fingerprint }),
    ],
  ],
  ["revoked signing key", [register(anna), revokeKey(anna), signed("ISSUE", anna)]],
]) {
  test(`a log-endorsed issue still fails with ${label}`, async (t) => {
    serve(t, entries);
    await assert.rejects(
      verifyPublicDocuments(hash, [candidate(documentId, orgId, entries.length - 1)]),
    );
  });
}

test("revocation must target the original issue and itself have a valid signature", async (t) => {
  const revoked = {
    ...candidate(),
    status: "revoked",
    revocation: { leafIndex: 2, signer: { id: anna.person, name: "Anna" } },
  };
  for (const [label, event] of [
    ["wrong target", signed("REVOKE", anna, { targetLeafIndex: 0 })],
    ["signature changed", { ...signed("REVOKE", anna), signature: "bb".repeat(64) }],
    ["foreign organization", signed("REVOKE", anna, { orgId: "other" })],
  ]) {
    await t.test(label, async (s) => {
      serve(s, [register(anna), signed("ISSUE", anna), event]);
      await assert.rejects(verifyPublicDocuments(hash, [revoked]));
    });
  }
});

test("unsigned lookup fields cannot change signed details or conceal issuance", async (t) => {
  serve(t, [register(anna), signed("ISSUE", anna)]);
  await assert.rejects(verifyPublicDocuments(hash, []));
  for (const overwrite of [
    { id: "other" },
    { fileHash: "bb".repeat(32) },
    { title: "변경" },
    { category: "other" },
    { org: { id: "other" } },
    { org: { id: orgId, slug: orgId, name: {} } },
    { issue: { leafIndex: 1, signer: { id: anna.person, name: {} } } },
    { issue: { leafIndex: 0, signer: { id: anna.person } } },
    { issue: { leafIndex: 1, signer: { id: bo.person } } },
    { status: "revoked" },
    { revocation: { leafIndex: 1, signer: { id: anna.person } } },
  ]) {
    await assert.rejects(verifyPublicDocuments(hash, [{ ...candidate(), ...overwrite }]));
  }
});

for (const [label, route, change] of [
  ["altered head", "sth", (head) => ({ ...head, timestamp: "2026-11-25T00:01:00.000Z" })],
  ["hidden entry", "entries", (rows) => rows.slice(0, 1)],
  ["reordered entries", "entries", (rows) => rows.toReversed()],
  ["altered leaf metadata", "entries", (rows) => [{ ...rows[0], type: "ISSUE" }, rows[1]]],
  [
    "incorrect inclusion path",
    "proof/inclusion",
    (proof) => ({ ...proof, auditPath: ["cc".repeat(32)] }),
  ],
  ["incorrect proof position", "proof/inclusion", (proof) => ({ ...proof, leafIndex: 0 })],
  [
    "substituted entries and matching leaf hashes",
    "entries",
    (rows) => {
      const entry = { ...JSON.parse(rows[0].entryJson), approvedBy: "another owner" };
      return [
        {
          ...rows[0],
          entryJson: canonicalize(entry),
          leafHash: bytesToHex(leafHash(canonicalBytes(entry))),
        },
        rows[1],
      ];
    },
  ],
]) {
  test(`verification detects ${label}`, async (t) => {
    serve(t, [register(anna), signed("ISSUE", anna)], (body, requested) =>
      requested === route ? change(body) : body,
    );
    await assert.rejects(verifyPublicDocuments(hash, [candidate()]));
  });
}
