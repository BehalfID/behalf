import { generateKeyPairSync } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findActiveAdmin: vi.fn(),
  strictAudit: vi.fn()
}));

vi.mock("@/lib/consoleAdmins", () => ({
  findActiveConsoleAdmin: mocks.findActiveAdmin,
  recordAdminAuditStrict: mocks.strictAudit
}));

const signingKey = generateKeyPairSync("ed25519").privateKey.export({
  format: "pem",
  type: "pkcs8"
}).toString();
const state = "state_abcdefghijklmnopqrstuvwxyz_123456";

async function adminCookie(adminId = "cad_attributed") {
  const { createConsoleAdminSessionValue } = await import("@/lib/adminAuth");
  return `behalfid_console=${createConsoleAdminSessionValue(adminId)}`;
}

async function sharedCookie() {
  const { createConsoleSessionValue } = await import("@/lib/adminAuth");
  return `behalfid_console=${createConsoleSessionValue()}`;
}

function request(query: string, cookie?: string) {
  return new NextRequest(`https://console.behalfid.com/console/orchestra/authorize?${query}`, {
    headers: cookie ? { cookie } : undefined
  });
}

describe("Agent Orchestra console authorization route", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("BEHALFID_SETUP_TOKEN", "test-session-signing-secret");
    vi.stubEnv("BEHALFID_ADMIN_PASSWORD", "test-shared-password");
    vi.stubEnv("BEHALFID_ORCHESTRA_SSO_PRIVATE_KEY", signingKey);
    vi.stubEnv("BEHALFID_ORCHESTRA_SSO_KEY_ID", "orchestra-2026-01");
    delete process.env.BEHALFID_ORCHESTRA_SSO_CALLBACK_URL;
    mocks.findActiveAdmin.mockResolvedValue({ adminId: "cad_attributed", role: "owner" });
    mocks.strictAudit.mockResolvedValue(undefined);
  });

  it("issues for a valid cookie only when the referenced admin is currently active", async () => {
    const { GET } = await import("@/app/console/orchestra/authorize/route");
    const response = await GET(request(`state=${state}`, await adminCookie()));
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(mocks.findActiveAdmin).toHaveBeenCalledWith("cad_attributed");
    expect(html).toContain('method="post"');
    expect(html).toContain('action="https://serv1.behalfid.com/auth/callback"');
    expect(html).toContain('name="assertion"');
  });

  it.each(["disabled", "nonexistent"])("denies a %s admin", async () => {
    mocks.findActiveAdmin.mockResolvedValue(null);
    const { GET } = await import("@/app/console/orchestra/authorize/route");
    const response = await GET(request(`state=${state}`, await adminCookie()));
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('name="assertion"');
    expect(mocks.strictAudit).not.toHaveBeenCalled();
  });

  it("fails closed when active-admin lookup fails", async () => {
    mocks.findActiveAdmin.mockRejectedValue(new Error("database unavailable"));
    const { GET } = await import("@/app/console/orchestra/authorize/route");
    const response = await GET(request(`state=${state}`, await adminCookie()));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('name="assertion"');
    expect(mocks.strictAudit).not.toHaveBeenCalled();
  });

  it("denies shared sessions before any admin lookup", async () => {
    const { GET } = await import("@/app/console/orchestra/authorize/route");
    const response = await GET(request(`state=${state}`, await sharedCookie()));
    expect(response.status).toBe(403);
    expect(mocks.findActiveAdmin).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain('name="assertion"');
  });

  it("redirects missing, invalid, and expired sessions to the existing login flow", async () => {
    const { GET } = await import("@/app/console/orchestra/authorize/route");
    for (const cookie of [undefined, "behalfid_console=invalid.session.value"]) {
      const response = await GET(request(`state=${state}`, cookie));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/console/login");
      expect(mocks.strictAudit).not.toHaveBeenCalled();
    }

    const cookie = await adminCookie();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 8 * 60 * 60 * 1000 + 1);
    const expired = await GET(request(`state=${state}`, cookie));
    expect(expired.status).toBe(307);
  });

  it("denies malformed, missing, or duplicated state", async () => {
    const { GET } = await import("@/app/console/orchestra/authorize/route");
    for (const query of ["", "state=short", `state=${state}&state=${state}`]) {
      const response = await GET(request(query, await adminCookie()));
      expect(response.status).toBe(400);
      expect(await response.text()).not.toContain('name="assertion"');
    }
    expect(mocks.findActiveAdmin).not.toHaveBeenCalled();
  });

  it("ignores arbitrary callback fields and pins the production destination", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { GET } = await import("@/app/console/orchestra/authorize/route");
    const response = await GET(request(
      `state=${state}&callback=${encodeURIComponent("https://evil.example/steal")}&returnUrl=${encodeURIComponent("https://evil.example")}`,
      await adminCookie()
    ));
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('action="https://serv1.behalfid.com/auth/callback"');
    expect(html).not.toContain("evil.example");
  });

  it("returns no assertion when durable audit persistence fails", async () => {
    mocks.strictAudit.mockRejectedValue(new Error("audit unavailable"));
    const { GET } = await import("@/app/console/orchestra/authorize/route");
    const response = await GET(request(`state=${state}`, await adminCookie()));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('name="assertion"');
  });

  it("audits attribution and issuance metadata without bearer or secret material", async () => {
    const { GET } = await import("@/app/console/orchestra/authorize/route");
    await GET(request(`state=${state}`, await adminCookie()));
    expect(mocks.strictAudit).toHaveBeenCalledWith(expect.objectContaining({
      adminId: "cad_attributed",
      action: "orchestra_sso.issued",
      target: "serv1.behalfid.com",
      requestId: expect.stringMatching(/^[A-Za-z0-9_-]{24}$/),
      metadata: expect.objectContaining({
        audience: "serv1.behalfid.com",
        keyId: "orchestra-2026-01",
        issuedAt: expect.any(Number),
        expiresAt: expect.any(Number)
      })
    }));
    const audit = JSON.stringify(mocks.strictAudit.mock.calls);
    expect(audit).not.toContain("eyJ");
    expect(audit).not.toContain(signingKey);
    expect(audit).not.toContain("behalfid_console");
  });

  it("returns an isolated no-store, no-referrer, non-hydrated handoff document", async () => {
    const { GET } = await import("@/app/console/orchestra/authorize/route");
    const response = await GET(request(`state=${state}`, await adminCookie()));
    const html = await response.text();
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(csp).toContain("form-action https://serv1.behalfid.com/auth/callback");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toContain("*");
    expect(csp.split("; ").find((directive) => directive.startsWith("form-action")))
      .toBe("form-action https://serv1.behalfid.com/auth/callback");
    const scriptNonce = html.match(/<script nonce="([A-Za-z0-9_-]+)">/)?.[1];
    expect(scriptNonce).toBeTruthy();
    expect(csp).toContain(`script-src 'nonce-${scriptNonce}'`);
    expect(html).toContain("document.getElementById(\"handoff\").submit()");
    expect(html).toContain("Continue to Agent Orchestra</button>");
    expect(html).not.toContain("__next");
    expect(html).not.toContain("_next/static");
    expect(html).not.toContain("HeyCatch");
    expect(html).not.toContain("analytics");
    expect(html).not.toContain(signingKey);
    expect(html).not.toContain("behalfid_console");
  });

});
