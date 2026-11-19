import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module.js";
import { InvitationsModule } from "./invitations/invitations.module.js";
import { MembersModule } from "./members/members.module.js";
import { OrgsModule } from "./orgs/orgs.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";

@Module({
  // shortcut: counters are per process; use shared storage before running multiple API replicas.
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    PrismaModule,
    AuthModule,
    OrgsModule,
    MembersModule,
    InvitationsModule,
  ],
})
export class AppModule {}
