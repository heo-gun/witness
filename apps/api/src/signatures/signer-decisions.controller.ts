import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { JsonRequestGuard } from "../auth/json-request.guard.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { AuthenticatedUser } from "../auth/session.service.js";
import { VerifiedEmailGuard } from "../auth/verified-email.guard.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires runtime DTO classes.
import { RejectRequestDto, SignRequestDto } from "./dto/decision.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { SignerDecisionsService } from "./signer-decisions.service.js";

const requestId = new ParseUUIDPipe({ version: "7" });

@Controller("signature-requests/:id")
@UseGuards(JwtAuthGuard, JsonRequestGuard, VerifiedEmailGuard)
export class SignerDecisionsController {
  constructor(private readonly decisions: SignerDecisionsService) {}

  @Post("sign")
  @HttpCode(200)
  sign(
    @Param("id", requestId) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: SignRequestDto,
  ) {
    return this.decisions.decide(id, user, input);
  }

  @Post("reject")
  @HttpCode(200)
  reject(
    @Param("id", requestId) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: RejectRequestDto,
  ) {
    return this.decisions.decide(id, user, input);
  }
}
