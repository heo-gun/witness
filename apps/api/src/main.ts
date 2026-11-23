import "reflect-metadata";
import { isIP } from "node:net";
import type { INestApplication } from "@nestjs/common";
import type { Express } from "express";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { API_PREFIX } from "@tlog/shared";
import { AppModule } from "./app.module.js";

export function configureApp(
  app: INestApplication,
  webProxyIp = process.env.TRUSTED_WEB_PROXY_IP,
): void {
  if (webProxyIp) {
    if (!isIP(webProxyIp)) throw new Error("TRUSTED_WEB_PROXY_IP must be a single IP address");
    const express: Express = app.getHttpAdapter().getInstance();
    express.set("trust proxy", webProxyIp);
  }
  app.setGlobalPrefix(API_PREFIX.slice(1));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(Number(process.env.PORT ?? 4000), process.env.API_BIND_HOST ?? "127.0.0.1");
}

// e2e 테스트가 configureApp만 import할 때는 서버를 띄우지 않는다
if (require.main === module) {
  void bootstrap();
}
