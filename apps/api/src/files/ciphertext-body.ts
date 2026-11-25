import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { isLowercaseHex } from "@tlog/shared";
import type { Request } from "express";

const TAG_BYTES = 16;
const MAX_BYTES = 20 * 1024 * 1024 + TAG_BYTES;

export function envelopeHeaders(req: Request) {
  if (req.get("sec-fetch-site") === "cross-site") throw new ForbiddenException();
  if (
    req.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/octet-stream" ||
    (req.get("content-encoding") ?? "identity") !== "identity"
  )
    throw new UnsupportedMediaTypeException("Uncompressed binary ciphertext required");
  const ephemeralPublicKey = req.get("x-ephemeral-public-key");
  const iv = req.get("x-iv");
  const recipientFingerprint = req.get("x-recipient-fingerprint");
  if (
    !isLowercaseHex(ephemeralPublicKey, 32) ||
    !isLowercaseHex(iv, 12) ||
    !isLowercaseHex(recipientFingerprint, 32)
  )
    throw new BadRequestException("Invalid encryption metadata");
  return { ephemeralPublicKey, iv, recipientFingerprint };
}

export async function readCiphertext(req: Request): Promise<Buffer> {
  const declared = req.get("content-length");
  if (!declared) throw new HttpException("Ciphertext length required", 411);
  const length = Number(declared);
  if (!/^[0-9]+$/.test(declared) || length < TAG_BYTES)
    throw new BadRequestException("Invalid ciphertext length");
  if (length > MAX_BYTES) {
    req.resume();
    throw new PayloadTooLargeException();
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const data = chunk as Buffer;
    size += data.length;
    if (size > length) {
      req.resume();
      throw new PayloadTooLargeException();
    }
    chunks.push(data);
  }
  if (size !== length) throw new BadRequestException("Incomplete ciphertext");
  return Buffer.concat(chunks, size);
}
