import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { API_PREFIX } from "@tlog/shared";
import { AppModule } from "./app.module.js";

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX.slice(1));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(Number(process.env.PORT ?? 4000));
}

// e2e 테스트가 configureApp만 import할 때는 서버를 띄우지 않는다
if (require.main === module) {
  void bootstrap();
}
