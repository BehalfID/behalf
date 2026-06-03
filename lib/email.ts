/**
 * Isolated SMTP email transport.
 * Swap the transport for Resend/Postmark/SES by replacing this module only —
 * no auth logic needs to change.
 */

import nodemailer, { type Transporter } from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
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

export async function sendEmail(message: EmailMessage): Promise<void> {
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
