// Run with `node apps/web/test/browser/member-keys.mjs`, then open the printed localhost URL.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

async function check() {
  const { generateMemberKeys, getPrivateKey, listLocalKeys } = await import("/keys.js");
  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }
  const scope = { userId: "signer", orgId: "demo" };
  if (!sessionStorage.getItem("original")) {
    const [sign, retry, encrypt] = await Promise.all([
      generateMemberKeys(scope, "sign", []),
      generateMemberKeys(scope, "sign", []),
      generateMemberKeys(scope, "encrypt", []),
    ]);
    assert(sign.fingerprint === retry.fingerprint, "Concurrent attempts generated duplicate keys");
    assert(
      Object.keys(sign).sort().join() === "fingerprint,publicKey,purpose",
      "Unexpected fields",
    );
    sessionStorage.setItem("original", JSON.stringify({ sign, encrypt }));
    location.reload();
    return;
  }
  const { sign, encrypt } = JSON.parse(sessionStorage.getItem("original"));
  const keys = await listLocalKeys(scope);
  assert(keys.length === 2, "Persisted key count changed across reload");
  for (const key of [sign, encrypt]) {
    const raw = Uint8Array.fromHex(key.publicKey);
    assert(raw.length === 32, "Invalid raw public key length");
    const digest = await crypto.subtle.digest("SHA-256", raw);
    assert(new Uint8Array(digest).toHex() === key.fingerprint, "Invalid fingerprint");
    const secret = await getPrivateKey(scope, key.purpose, key.fingerprint);
    assert(secret && !secret.extractable, "Expected a persisted non-extractable CryptoKey");
    const exportError = await crypto.subtle.exportKey("pkcs8", secret).then(
      () => null,
      (e) => e.name,
    );
    assert(exportError === "InvalidAccessError", "Private key export succeeded");
    if (key.purpose === "sign") {
      const verifier = await crypto.subtle.importKey("raw", raw, "Ed25519", false, ["verify"]);
      const message = new TextEncoder().encode("Witness key persistence");
      const sig = await crypto.subtle.sign("Ed25519", secret, message);
      assert(await crypto.subtle.verify("Ed25519", verifier, sig, message), "Signature failed");
    } else {
      const remote = await crypto.subtle.generateKey("X25519", false, ["deriveBits"]);
      const pub = await crypto.subtle.importKey("raw", raw, "X25519", false, []);
      const localBits = await crypto.subtle.deriveBits(
        { name: "X25519", public: remote.publicKey },
        secret,
        256,
      );
      const remoteBits = await crypto.subtle.deriveBits(
        { name: "X25519", public: pub },
        remote.privateKey,
        256,
      );
      assert(
        new Uint8Array(localBits).toHex() === new Uint8Array(remoteBits).toHex(),
        "Key agreement failed",
      );
    }
  }
  const replacement = await generateMemberKeys(scope, "sign", [sign.fingerprint]);
  assert(replacement.fingerprint !== sign.fingerprint, "Replacement reused the old key");
  assert(await getPrivateKey(scope, "sign", sign.fingerprint), "Replacement removed the old key");
  assert(!(await getPrivateKey(scope, "encrypt", sign.fingerprint)), "Purpose isolation failed");
  for (const other of [
    { ...scope, userId: "other" },
    { ...scope, orgId: "other" },
  ]) {
    assert((await listLocalKeys(other)).length === 0, "Scope leaked key metadata");
    assert(!(await getPrivateKey(other, "sign", sign.fingerprint)), "Scope leaked a private key");
  }
  await fetch("/pass", { method: "POST" });
}

const source = await readFile(new URL("../../src/lib/crypto/keys.ts", import.meta.url), "utf8");
const hex = await readFile(
  new URL("../../../../packages/shared/src/hex.ts", import.meta.url),
  "utf8",
);
const server = createServer((req, res) => {
  if (req.url === "/keys.js" || req.url === "/hex.js") {
    res.setHeader("Content-Type", "text/javascript");
    return res.end(stripTypeScriptTypes(req.url === "/keys.js" ? source : hex));
  }
  if (req.method === "POST" && (req.url === "/pass" || req.url === "/fail")) {
    if (req.url === "/fail") process.exitCode = 1;
    req.setEncoding("utf8").on("data", (chunk) => process.stderr.write(chunk));
    req.on("end", () => {
      console.log(process.exitCode ? "Browser key checks failed" : "Browser key checks passed");
      res.end();
      server.close();
    });
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<title>Witness browser key tests</title>
<script type="importmap">{"imports":{"@tlog/shared":"/hex.js"}}</script>
<script type="module">
try { await (${check.toString()})(); } catch (error) { await fetch("/fail", {method:"POST", body:String(error)}); }
</script>`);
});
server.listen(0, "127.0.0.1", () => console.log("http://127.0.0.1:" + server.address().port));
