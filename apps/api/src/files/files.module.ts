import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { CiphertextCleanup } from "./ciphertext-cleanup.service.js";
import { CiphertextStorage } from "./ciphertext-storage.service.js";
import { FilesController } from "./files.controller.js";
import { FilesService } from "./files.service.js";

@Module({
  imports: [AuthModule],
  controllers: [FilesController],
  providers: [CiphertextStorage, CiphertextCleanup, FilesService],
  exports: [CiphertextStorage, CiphertextCleanup],
})
export class FilesModule {}
