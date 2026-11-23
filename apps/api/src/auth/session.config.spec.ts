import { JwtService } from "@nestjs/jwt";
import { getJwtOptions, sessionCookieOptions } from "./session.config.js";

describe("Session configuration", () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it.each([undefined, "", "short-secret"])("rejects a missing or short secret (%#)", (secret) => {
    if (secret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = secret;
    expect(() => getJwtOptions()).toThrow("JWT_SECRET must contain at least 32 bytes");
  });

  it("restricts the JWT algorithm and enables secure cookies in production", () => {
    process.env.JWT_SECRET = "x".repeat(32);
    process.env.NODE_ENV = "production";
    expect(getJwtOptions().verifyOptions?.algorithms).toEqual(["HS256"]);
    expect(sessionCookieOptions()).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax" });
  });

  it("accepts a session just before four hours and rejects it at four hours", () => {
    process.env.JWT_SECRET = "x".repeat(32);
    const jwt = new JwtService(getJwtOptions());
    const issuedAt = 1_800_000_000;
    const expiresAt = issuedAt + 4 * 60 * 60;
    const token = jwt.sign({ sub: "test-user", iat: issuedAt });

    expect(jwt.verify(token, { clockTimestamp: expiresAt - 1 })).toMatchObject({ exp: expiresAt });
    expect(() => jwt.verify(token, { clockTimestamp: expiresAt })).toThrow("jwt expired");
  });
});
