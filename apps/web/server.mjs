import { createServer } from "node:http";
import { forwardedHeaders } from "./forwarded-headers.mjs";

const dev = process.argv.includes("--dev");
process.env.NODE_ENV ??= dev ? "development" : "production";
const port = Number(process.env.PORT ?? 3000);
const setForwardedHeaders = forwardedHeaders(process.env.TRUSTED_INGRESS_IP);
const { default: next } = await import("next");

const server = createServer();
const app = next({ dev, port, httpServer: server });
await app.prepare();
const handle = app.getRequestHandler();
server.on("request", (req, res) => {
  setForwardedHeaders(req);
  void handle(req, res);
});
// Next installs its upgrade handler on the first HTTP request.
server.once("request", () => server.prependListener("upgrade", setForwardedHeaders));
server.listen(port);
