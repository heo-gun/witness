import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { FilesModule } from "../files/files.module.js";
import { LogModule } from "../log/log.module.js";
import { OrgsModule } from "../orgs/orgs.module.js";
import { InboxController } from "./inbox.controller.js";
import { InboxService } from "./inbox.service.js";
import { SignerDecisionsController } from "./signer-decisions.controller.js";
import { SignerDecisionsService } from "./signer-decisions.service.js";
import { SignaturesController } from "./signatures.controller.js";
import { SignaturesService } from "./signatures.service.js";

@Module({
  imports: [AuthModule, OrgsModule, FilesModule, LogModule],
  controllers: [SignaturesController, SignerDecisionsController, InboxController],
  providers: [SignaturesService, SignerDecisionsService, InboxService],
})
export class SignaturesModule {}
