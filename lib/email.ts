/**
 * Isolated SMTP email transport.
 * Swap the transport for Resend/Postmark/SES by replacing this module only —
 * no auth logic needs to change.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import nodemailer, { type Transporter } from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function hasSmtpConfig() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

function isProductionRuntime() {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === "production";
  return process.env.NODE_ENV === "production";
}

function buildTransport(): Transporter {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP_HOST, SMTP_USER, and SMTP_PASS are required to send email.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
}

/**
 * Local/dev fallback when SMTP is unset: write the message to
 * `.behalf/dev-email.log` and echo a short notice to the server console so
 * verification codes remain reachable without a mailbox.
 */
async function deliverDevFallback(message: EmailMessage): Promise<void> {
  const dir = join(process.cwd(), ".behalf");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString();
  const entry = [
    `---- ${stamp} ----`,
    `to: ${message.to}`,
    `subject: ${message.subject}`,
    message.text,
    ""
  ].join("\n");
  await appendFile(join(dir, "dev-email.log"), entry, "utf8");
  console.info(`[behalfid:dev-email] Queued message for ${message.to} → .behalf/dev-email.log`);
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!hasSmtpConfig()) {
    if (isProductionRuntime()) {
      throw new Error("SMTP_HOST, SMTP_USER, and SMTP_PASS are required to send email.");
    }
    await deliverDevFallback(message);
    return;
  }

  const from = process.env.EMAIL_FROM ?? "support@behalfid.com";
  const transport = buildTransport();
  await transport.sendMail({
    from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html
  });
}
