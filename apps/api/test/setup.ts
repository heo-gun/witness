import { randomBytes } from "node:crypto";
import { getTestDatabaseUrl } from "./database.js";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.JWT_SECRET = randomBytes(32).toString("hex");
