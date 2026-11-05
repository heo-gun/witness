import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma CLI는 .env를 자동으로 읽지 않는다
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // generate는 DB 없이도 돌아야 하므로 env()로 강제하지 않는다. migrate는 url이 없으면 실패한다
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
