import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { OrgsModule } from "../orgs/orgs.module.js";
import { SignaturesController } from "./signatures.controller.js";
import { SignaturesService } from "./signatures.service.js";

@Module({
  imports: [AuthModule, OrgsModule],
  controllers: [SignaturesController],
  providers: [SignaturesService],
})
export class SignaturesModule {}
