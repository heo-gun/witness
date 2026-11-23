import { BlockList, isIP } from "node:net";

export function forwardedHeaders(ingressIp) {
  const ingress = new BlockList();
  if (ingressIp) {
    if (!isIP(ingressIp)) throw new Error("TRUSTED_INGRESS_IP must be a single IP address");
    ingress.addAddress(ingressIp, isIP(ingressIp) === 6 ? "ipv6" : "ipv4");
  }
  return function setForwardedHeaders(req) {
    const peer = req.socket.remoteAddress;
    const trusted = peer && ingress.check(peer, isIP(peer) === 6 ? "ipv6" : "ipv4");
    // Our ingress appends or overwrites the last hop with its TCP peer.
    const client = trusted && req.headers["x-forwarded-for"]?.split(",").at(-1)?.trim();
    const protocol = trusted && req.headers["x-forwarded-proto"]?.split(",").at(-1)?.trim();
    for (const name of Object.keys(req.headers)) {
      if (name.startsWith("x-forwarded-") || name === "forwarded" || name === "x-real-ip") {
        delete req.headers[name];
      }
    }
    if (peer) req.headers["x-forwarded-for"] = client && isIP(client) ? client : peer;
    if (protocol === "https" || protocol === "http") req.headers["x-forwarded-proto"] = protocol;
  };
}
