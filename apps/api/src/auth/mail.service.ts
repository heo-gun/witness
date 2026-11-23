import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import nodemailer from "nodemailer";
import type { EmailTokenPurpose } from "../generated/prisma/client.js";

@Injectable()
export class MailService {
  async send(
    email: string,
    token: string,
    purpose: EmailTokenPurpose,
    existingAccount?: "verified" | "unverified",
  ): Promise<void> {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAIL_FROM, APP_ORIGIN } = process.env;
    if (!SMTP_HOST || !SMTP_PORT || !MAIL_FROM || !APP_ORIGIN) {
      throw new ServiceUnavailableException("Email delivery is not configured");
    }
    const origin = new URL(APP_ORIGIN);
    const local = ["localhost", "127.0.0.1"].includes(SMTP_HOST);
    if (
      origin.origin !== APP_ORIGIN ||
      (origin.protocol !== "https:" &&
        !(
          process.env.NODE_ENV !== "production" &&
          origin.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(origin.hostname)
        ))
    )
      throw new ServiceUnavailableException("Invalid mail origin");
    const port = Number(SMTP_PORT);
    if (
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      Boolean(SMTP_USER) !== Boolean(SMTP_PASSWORD)
    ) {
      throw new ServiceUnavailableException("Invalid SMTP configuration");
    }
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: process.env.NODE_ENV === "production" || !local,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    });
    const link = `${origin.origin}/auth/confirm#${purpose}:${token}`;
    let subject = purpose === "verify_email" ? "Witness 이메일 인증" : "Witness 비밀번호 재설정";
    let instructions = "아래 링크에서 새 비밀번호를 설정하세요.";
    if (existingAccount) {
      subject = "Witness 가입 요청 안내";
      instructions =
        existingAccount === "verified"
          ? `이미 인증한 이메일로 가입 요청이 있었습니다. 기존 계정으로 로그인하세요.\n${origin.origin}/login\n\n비밀번호를 잊으셨다면 아래 링크에서 재설정하세요.`
          : "아직 인증하지 않은 이메일로 가입 요청이 있었습니다. 본인이 요청했다면 아래 링크에서 이름과 새 비밀번호를 설정해 계정을 복구하세요.";
    }
    try {
      await transport.sendMail({
        from: MAIL_FROM,
        to: { address: email, name: "" },
        subject,
        text: `${instructions} 링크는 15분 동안 한 번만 사용할 수 있습니다.\n\n${link}\n\n요청하지 않았다면 무시하세요. 링크를 전달하지 마세요.`,
      });
    } catch {
      // SMTP errors can contain credentials or message contents.
      throw new ServiceUnavailableException("Email delivery failed");
    } finally {
      transport.close();
    }
  }
}
