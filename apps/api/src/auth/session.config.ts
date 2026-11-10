import type { JwtModuleOptions } from "@nestjs/jwt";
import type { CookieOptions } from "express";

export const SESSION_COOKIE = "tlog_session";
export const SESSION_SECONDS = 3600;

export function getJwtOptions(): JwtModuleOptions {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("JWT_SECRET must contain at least 32 bytes");
  }
  return {
    secret,
    signOptions: {
      algorithm: "HS256",
      expiresIn: SESSION_SECONDS,
      issuer: "tlog-api",
      audience: "tlog-web",
    },
    verifyOptions: {
      algorithms: ["HS256"],
      issuer: "tlog-api",
      audience: "tlog-web",
      maxAge: SESSION_SECONDS,
    },
  };
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/v1",
  };
}
