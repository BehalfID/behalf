/** Branded transactional email templates for BehalfID. */

import type { EmailMessage } from "./email";

function appUrl(): string {
  return (process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://behalfid.com").replace(/\/$/, "");
}

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #0a0a0a; color: #e5e5e5; font-family: "SF Mono", "Fira Code", "Consolas", monospace; font-size: 14px; line-height: 1.6; }
    .wrapper { max-width: 560px; margin: 48px auto; padding: 0 24px; }
    .header { border-bottom: 1px solid #222; padding-bottom: 20px; margin-bottom: 32px; }
    .wordmark { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; color: #fff; text-transform: uppercase; text-decoration: none; }
    h1 { font-size: 18px; font-weight: 600; color: #fff; margin: 0 0 16px; line-height: 1.3; }
    p { margin: 0 0 16px; color: #a3a3a3; }
    .action-block { margin: 32px 0; }
    .btn { display: inline-block; padding: 12px 24px; background: #fff; color: #0a0a0a; font-family: inherit; font-size: 13px; font-weight: 600; text-decoration: none; letter-spacing: 0.02em; }
    .link-fallback { margin-top: 16px; font-size: 12px; color: #666; word-break: break-all; }
    .link-fallback a { color: #888; }
    .footer { border-top: 1px solid #222; padding-top: 20px; margin-top: 40px; font-size: 12px; color: #555; }
    .expiry { display: inline-block; margin-top: 12px; padding: 8px 12px; background: #111; border: 1px solid #222; font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <a class="wordmark" href="${appUrl()}">BehalfID</a>
    </div>
    ${body}
    <div class="footer">
      <p>BehalfID · Agent permission infrastructure<br>If you did not request this, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>`;
}

export function verifyEmailTemplate(verificationUrl: string): EmailMessage {
  const subject = "Verify your BehalfID email address";

  const text = [
    "BehalfID — Verify your email address",
    "",
    "Confirm your email to activate your developer account.",
    "",
    `Verification link: ${verificationUrl}`,
    "",
    "This link expires in 24 hours.",
    "",
    "If you did not create a BehalfID account, you can safely ignore this email.",
    "",
    "— BehalfID"
  ].join("\n");

  const html = wrapHtml(
    subject,
    `<h1>Verify your email address</h1>
    <p>Confirm your email to activate your BehalfID developer account and enable API access.</p>
    <div class="action-block">
      <a class="btn" href="${verificationUrl}">Verify email address</a>
      <div class="link-fallback">Or copy this link: <a href="${verificationUrl}">${verificationUrl}</a></div>
    </div>
    <span class="expiry">Expires in 24 hours</span>`
  );

  return { to: "", subject, text, html };
}

export function resetPasswordTemplate(resetUrl: string): EmailMessage {
  const subject = "Reset your BehalfID password";

  const text = [
    "BehalfID — Password reset request",
    "",
    "A password reset was requested for your account.",
    "",
    `Reset link: ${resetUrl}`,
    "",
    "This link expires in 60 minutes. It can only be used once.",
    "",
    "If you did not request a password reset, your account is not at risk — this link will expire unused.",
    "",
    "— BehalfID"
  ].join("\n");

  const html = wrapHtml(
    subject,
    `<h1>Password reset request</h1>
    <p>A password reset was requested for your BehalfID developer account. Use the link below to set a new password.</p>
    <div class="action-block">
      <a class="btn" href="${resetUrl}">Reset password</a>
      <div class="link-fallback">Or copy this link: <a href="${resetUrl}">${resetUrl}</a></div>
    </div>
    <span class="expiry">Expires in 60 minutes · Single use</span>
    <p style="margin-top:24px">If you did not request this, your account is safe — this link will expire unused.</p>`
  );

  return { to: "", subject, text, html };
}

export function passwordChangedTemplate(): EmailMessage {
  const subject = "Your BehalfID password was changed";

  const text = [
    "BehalfID — Password changed",
    "",
    "Your BehalfID account password was successfully changed.",
    "",
    "If you made this change, no action is required.",
    "",
    "If you did not change your password, contact support immediately at support@behalfid.com",
    "",
    "— BehalfID"
  ].join("\n");

  const html = wrapHtml(
    subject,
    `<h1>Password changed</h1>
    <p>Your BehalfID account password was successfully changed.</p>
    <p>If you made this change, no further action is required.</p>
    <p>If you did not change your password, contact us immediately at <a href="mailto:support@behalfid.com" style="color:#888">support@behalfid.com</a>.</p>`
  );

  return { to: "", subject, text, html };
}
