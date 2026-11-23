import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { LogModule } from "../log/log.module.js";
import { OrgsModule } from "../orgs/orgs.module.js";
import { KeysReadService } from "./keys-read.service.js";
import { KeysWriteService } from "./keys-write.service.js";
import { KeysController } from "./keys.controller.js";

@Module({
  imports: [AuthModule, OrgsModule, LogModule],
  controllers: [KeysController],
  providers: [KeysReadService, KeysWriteService],
})
export class KeysModule {}
