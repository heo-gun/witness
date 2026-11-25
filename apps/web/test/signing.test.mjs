import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import test from "node:test";
import { canonicalBytes } from "@tlog/shared";
import { signPayload } from "../src/lib/crypto/sign.ts";
import { previewType } from "../src/lib/preview-type.ts";

test("a non-extractable signer key signs the canonical issue including the reviewed file hash", async () => {
  const { privateKey, publicKey } = await crypto.subtle.generateKey("Ed25519", false, [
    "sign",
    "verify",
  ]);
  const payload = {
    action: "ISSUE",
    orgId: "org",
    documentId: "doc",
    signerId: "user",
    signerKeyFingerprint: "34".repeat(32),
    fileHash: "12".repeat(32),
    title: "예산",
    category: "budget",
    signedAt: "2026-11-25T00:00:00.000Z",
  };
  const bytes = Buffer.from(await signPayload(payload, privateKey), "hex");
  const key = createPublicKey({
    key: await crypto.subtle.exportKey("jwk", publicKey),
    format: "jwk",
  });
  assert.equal(verify(null, canonicalBytes(payload), key, bytes), true);
  assert.equal(
    verify(null, canonicalBytes({ ...payload, fileHash: "56".repeat(32) }), key, bytes),
    false,
  );
});

test("a signed revocation binds the original issue leaf and the reason", async () => {
  const { privateKey, publicKey } = await crypto.subtle.generateKey("Ed25519", false, [
    "sign",
    "verify",
  ]);
  const payload = {
    action: "REVOKE",
    orgId: "org",
    documentId: "doc",
    targetLeafIndex: 4,
    reason: "예산 정정",
    signerId: "other-signer",
    signerKeyFingerprint: "34".repeat(32),
    signedAt: "2026-11-25T00:00:00.000Z",
  };
  const bytes = Buffer.from(await signPayload(payload, privateKey), "hex");
  assert.equal(
    await crypto.subtle.verify("Ed25519", publicKey, bytes, canonicalBytes(payload)),
    true,
  );
  for (const change of [{ reason: "다른 사유" }, { targetLeafIndex: 5 }]) {
    assert.equal(
      await crypto.subtle.verify(
        "Ed25519",
        publicKey,
        bytes,
        canonicalBytes({ ...payload, ...change }),
      ),
      false,
    );
  }
});

test("only PDF and supported raster file signatures select a document viewer", () => {
  assert.equal(previewType(Buffer.from("%PDF-1.7")), "application/pdf");
  assert.equal(previewType(Buffer.from("89504e470d0a1a0a", "hex")), "image/png");
  assert.equal(previewType(Buffer.from("ffd8ffe0", "hex")), "image/jpeg");
  assert.equal(previewType(Buffer.from("RIFF1234WEBP")), "image/webp");
  for (const input of ["<svg ", "<html>", "PDF", "RIFF1234WAVE"]) {
    assert.equal(previewType(Buffer.from(input)), undefined);
  }
});
