import { Module } from "@nestjs/common";
import { LogAppendService } from "./log-append.service.js";
import { LogReadService } from "./log-read.service.js";
import { LogController } from "./log.controller.js";
import { SthSignerService } from "./sth-signer.service.js";

@Module({
  controllers: [LogController],
  providers: [LogAppendService, LogReadService, SthSignerService],
  exports: [LogAppendService],
})
export class LogModule {}
