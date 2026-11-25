import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { AuthenticatedUser } from "../auth/session.service.js";
import { VerifiedEmailGuard } from "../auth/verified-email.guard.js";
import { envelopeHeaders, readCiphertext } from "./ciphertext-body.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { FilesService } from "./files.service.js";

const requestId = new ParseUUIDPipe({ version: "7" });

@Controller("signature-requests/:id/file")
@UseGuards(JwtAuthGuard, VerifiedEmailGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Put()
  upload(
    @Param("id", requestId) id: string,
    @Req() req: Request,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.files.upload(id, actor, envelopeHeaders(req), () => readCiphertext(req));
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async download(
    @Param("id", requestId) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { bytes, file } = await this.files.download(id, actor);
    res.set({
      "X-Ephemeral-Public-Key": file.ephemeralPublicKey,
      "X-IV": file.iv,
      "X-Recipient-Fingerprint": file.recipientFingerprint,
    });
    return new StreamableFile(bytes, {
      type: "application/octet-stream",
      length: bytes.byteLength,
    });
  }
}
