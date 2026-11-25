import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { LogModule } from "../log/log.module.js";
import { DocumentsController } from "./documents.controller.js";
import { DocumentsService } from "./documents.service.js";
import { RevocationsService } from "./revocations.service.js";

@Module({
  imports: [AuthModule, LogModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, RevocationsService],
})
export class DocumentsModule {}
