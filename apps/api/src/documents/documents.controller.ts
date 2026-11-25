import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { JsonRequestGuard } from "../auth/json-request.guard.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { AuthenticatedUser } from "../auth/session.service.js";
import { VerifiedEmailGuard } from "../auth/verified-email.guard.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires runtime DTO classes.
import { OrgSlugDto } from "../orgs/dto/org-slug.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { DocumentsService } from "./documents.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires runtime DTO classes.
import { RevokeDocumentDto, VerifyHashDto } from "./dto/document.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { RevocationsService } from "./revocations.service.js";

const documentId = new ParseUUIDPipe({ version: "7" });

@Controller()
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly revocations: RevocationsService,
  ) {}

  @Get("orgs/:slug/documents")
  @Header("Cache-Control", "no-store")
  list(@Param() { slug }: OrgSlugDto) {
    return this.documents.list({ org: { slug } });
  }

  @Get("documents/:id")
  @Header("Cache-Control", "no-store")
  detail(@Param("id", documentId) id: string) {
    return this.documents.byId(id);
  }

  @Get("verify")
  @Header("Cache-Control", "no-store")
  byHash(@Query() { hash }: VerifyHashDto) {
    return this.documents.list({ fileHash: hash });
  }

  @Post("documents/:id/revoke")
  @UseGuards(JwtAuthGuard, JsonRequestGuard, VerifiedEmailGuard)
  @HttpCode(200)
  revoke(
    @Param("id", documentId) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: RevokeDocumentDto,
  ) {
    return this.revocations.revoke(id, actor, input);
  }
}
