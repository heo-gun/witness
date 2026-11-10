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
});
