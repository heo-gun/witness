import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import type { EmailTokenPurpose } from "../generated/prisma/client.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI metadata.
import { PrismaService } from "../prisma/prisma.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI metadata.
import { PasswordService } from "./password.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI metadata.
import { MailService } from "./mail.service.js";
import type { ChangePasswordDto, ConsumeEmailTokenDto } from "./dto/email-token.dto.js";

const LIFETIME = 15 * 60_000;
const RESEND_INTERVAL = 60_000;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

interface EmailDelivery {
  userId: string;
  email: string;
  token: string;
  purpose: EmailTokenPurpose;
  existingAccount?: "verified" | "unverified";
}

@Injectable()
export class EmailTokenService {
  private readonly logger = new Logger(EmailTokenService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
  ) {}

  async request(email: string, intent: EmailTokenPurpose | "registration_attempt"): Promise<void> {
    const delivery = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM users WHERE email = ${email} FOR UPDATE`;
      if (!rows[0]) return null;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: rows[0].id },
        select: { id: true, email: true, emailVerifiedAt: true },
      });
      if (intent === "verify_email" && user.emailVerifiedAt) return null;
      const cooldown = { expiresAt: { gt: new Date(Date.now() + LIFETIME - RESEND_INTERVAL) } };
      const existingRegistration = intent === "registration_attempt";
      const purpose = existingRegistration ? "reset_password" : intent;
      const previous = await tx.emailToken.findFirst({
        where: {
          userId: user.id,
          // A signup retry must never rotate an existing recovery link.
          ...(existingRegistration
            ? { OR: [cooldown, { purpose, expiresAt: { gt: new Date() } }] }
            : { purpose, ...cooldown }),
        },
        select: { userId: true },
      });
      if (previous) return null;
      const reserved = await this.reserve(tx, user, purpose);
      if (existingRegistration) {
        reserved.existingAccount = user.emailVerifiedAt ? "verified" : "unverified";
      }
      return reserved;
    });
    if (delivery) await this.deliver(delivery);
  }

  async reserve(
    tx: Prisma.TransactionClient,
    user: { id: string; email: string },
    purpose: EmailTokenPurpose,
  ): Promise<EmailDelivery> {
    const token = randomBytes(32).toString("hex");
    const data = { tokenHash: hash(token), expiresAt: new Date(Date.now() + LIFETIME) };
    await tx.emailToken.upsert({
      where: { userId_purpose: { userId: user.id, purpose } },
      create: { userId: user.id, purpose, ...data },
      update: data,
    });
    return { userId: user.id, email: user.email, token, purpose };
  }

  async deliver({ userId, email, token, purpose, existingAccount }: EmailDelivery): Promise<void> {
    try {
      await this.mail.send(email, token, purpose, existingAccount);
    } catch {
      await this.prisma.emailToken.deleteMany({
        where: { userId, purpose, tokenHash: hash(token) },
      });
      // Keep the public response identical for missing accounts and delivery failures.
      this.logger.error("Authentication email delivery failed; check mail configuration");
    }
  }

  async consume(input: ConsumeEmailTokenDto): Promise<void> {
    const tokenHash = hash(input.token);
    const candidate = await this.prisma.emailToken.findUnique({ where: { tokenHash } });
    if (
      !candidate ||
      candidate.purpose !== input.purpose ||
      candidate.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException("Invalid or expired email token");
    }
    const passwordHash = await this.passwords.hash(input.password);
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${candidate.userId} FOR UPDATE`;
        const current = await tx.emailToken.findUnique({ where: { tokenHash } });
        if (
          !current ||
          current.purpose !== input.purpose ||
          current.expiresAt.getTime() <= Date.now()
        ) {
          throw new BadRequestException("Invalid or expired email token");
        }
        const user = await tx.user.findUniqueOrThrow({ where: { id: current.userId } });
        if (
          (!user.emailVerifiedAt && (await tx.membership.count({ where: { userId: user.id } }))) ||
          (await tx.memberKey.count({
            where: { userId: user.id, status: { in: ["pending", "active"] } },
          }))
        ) {
          throw new ConflictException("Existing memberships or keys require manual recovery");
        }
        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
            tokenVersion: { increment: 1 },
          },
        });
        await tx.emailToken.deleteMany({ where: { userId: user.id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async changePassword(userId: string, input: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.passwords.verify(user.passwordHash, input.currentPassword)))
      throw new UnauthorizedException("Invalid password");
    const passwordHash = await this.passwords.hash(input.password);
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: { id: userId, tokenVersion: user.tokenVersion, passwordHash: user.passwordHash },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      if (changed.count !== 1) throw new UnauthorizedException("Session changed; sign in again");
      await tx.emailToken.deleteMany({ where: { userId } });
    });
  }
}
