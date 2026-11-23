import assert from "node:assert/strict";
import test from "node:test";
import { forwardedHeaders } from "../forwarded-headers.mjs";

const sanitize = forwardedHeaders("192.0.2.1");
function headers(peer, chain) {
  const req = {
    socket: { remoteAddress: peer },
    headers: {
      host: "example.test",
      forwarded: "for=192.0.2.5",
      "x-real-ip": "192.0.2.5",
      "x-forwarded-for": chain,
      "x-forwarded-proto": "https",
    },
  };
  sanitize(req);
  return req.headers;
}

test("direct clients are identified by their socket", () => {
  assert.deepEqual(headers("192.0.2.2", "192.0.2.5"), {
    host: "example.test",
    "x-forwarded-for": "192.0.2.2",
  });
});

test("only the configured ingress can supply the final client hop", () => {
  assert.deepEqual(headers("::ffff:192.0.2.1", "192.0.2.5, 2001:db8::1"), {
    host: "example.test",
    "x-forwarded-for": "2001:db8::1",
    "x-forwarded-proto": "https",
  });
  assert.equal(headers("192.0.2.1", "invalid")["x-forwarded-for"], "192.0.2.1");
  assert.throws(() => forwardedHeaders("0.0.0.0/0"), /single IP/);
});
