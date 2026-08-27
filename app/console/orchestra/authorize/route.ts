import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { CONSOLE_COOKIE_NAME, parseConsoleSession } from "@/lib/adminAuth";
import { PRIVATE_NO_STORE } from "@/lib/cachePolicy";
import { findActiveConsoleAdmin, recordAdminAuditStrict } from "@/lib/consoleAdmins";
import {
  getOrchestraSsoCallbackUrl,
  issueOrchestraSsoAssertion,
  validateOrchestraSsoState
} from "@/lib/orchestraSso";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function documentResponse(input: {
  title: string;
  heading: string;
  message: string;
  status: number;
  form?: { callbackUrl: string; assertion: string };
}) {
  const nonce = crypto.randomBytes(18).toString("base64url");
  const formAction = input.form ? new URL(input.form.callbackUrl).toString() : "'none'";
  const form = input.form
    ? `<form id="handoff" method="post" action="${escapeHtml(input.form.callbackUrl)}">
        <input type="hidden" name="assertion" value="${escapeHtml(input.form.assertion)}">
        <button type="submit">Continue to Agent Orchestra</button>
      </form>
      <script nonce="${nonce}">document.getElementById("handoff").submit();</script>`
    : "";
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(input.title)}</title>
  <style nonce="${nonce}">
    :root{color-scheme:light dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f7f5f2;color:#252321}
    *{box-sizing:border-box}body{min-height:100vh;min-height:100svh;margin:0;display:grid;place-items:center;padding:24px;background:#f7f5f2}
    main{width:min(420px,100%);padding:26px 24px;border:1px solid #ded9d2;border-radius:8px;background:#fff;box-shadow:0 12px 32px rgba(37,35,33,.08)}
    p{margin:10px 0 20px;color:#68625c;font-size:14px;line-height:1.55}small{display:block;margin:0 0 8px;color:#9a5b38;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
    h1{margin:0;font-size:24px;line-height:1.2;letter-spacing:-.02em}form{margin-top:22px}button{width:100%;min-height:42px;border:1px solid #9a5b38;border-radius:6px;background:#9a5b38;color:#fff;font:600 14px/1 system-ui,-apple-system,sans-serif;cursor:pointer}
    button:hover{background:#814a2d;border-color:#814a2d}button:focus-visible{outline:3px solid rgba(154,91,56,.35);outline-offset:2px}
    @media(prefers-color-scheme:dark){:root,body{background:#181715;color:#f3f0ec}main{background:#23211f;border-color:#3d3935}p{color:#bdb6ae}}
    @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
  </style>
</head>
<body><main aria-labelledby="handoff-title"><small>Agent Orchestra</small><h1 id="handoff-title">${escapeHtml(input.heading)}</h1><p>${escapeHtml(input.message)}</p>${form}</main></body>
</html>`;

  return new NextResponse(html, {
    status: input.status,
    headers: {
      "Cache-Control": PRIVATE_NO_STORE,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'`,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function denied(status: number, unavailable = false) {
  return documentResponse({
    status,
    title: "Agent Orchestra authorization — BehalfID",
    heading: unavailable ? "Authorization unavailable" : "Authorization denied",
    message: unavailable
      ? "The secure handoff is unavailable. Contact an operator and try again."
      : "Return to Agent Orchestra and begin a new sign-in request."
  });
}

export async function GET(request: NextRequest) {
  const states = request.nextUrl.searchParams.getAll("state");
  const state = states.length === 1 ? validateOrchestraSsoState(states[0]) : null;
  const session = parseConsoleSession(request.cookies.get(CONSOLE_COOKIE_NAME)?.value);

  if (!session) {
    const loginUrl = new URL("/console/login", request.url);
    if (state) loginUrl.searchParams.set("next", `/console/orchestra/authorize?state=${state}`);
    return NextResponse.redirect(loginUrl);
  }
  if (session.kind !== "admin") return denied(403);
  if (!state) return denied(400);

  try {
    const principal = await findActiveConsoleAdmin(session.adminId);
    if (!principal) return denied(403);

    const callbackUrl = getOrchestraSsoCallbackUrl();
    const issued = await issueOrchestraSsoAssertion({ adminId: principal.adminId, state });
    await recordAdminAuditStrict({
      adminId: principal.adminId,
      action: "orchestra_sso.issued",
      target: "serv1.behalfid.com",
      requestId: issued.jti,
      metadata: {
        audience: "serv1.behalfid.com",
        keyId: issued.keyId,
        issuedAt: issued.issuedAt,
        expiresAt: issued.expiresAt
      }
    });
    return documentResponse({
      status: 200,
      title: "Opening Agent Orchestra — BehalfID",
      heading: "Opening Agent Orchestra",
      message: "Your attributed console session has been verified.",
      form: { callbackUrl, assertion: issued.assertion }
    });
  } catch {
    return denied(503, true);
  }
}
