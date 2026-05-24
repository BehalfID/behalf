/**
 * Unit tests for the Site Guard snippet helpers.
 *
 * Verifies the contracts the dashboard integration panel relies on:
 *  - Snippets include Authorization: Bearer (never x-developer-token)
 *  - Snippets do NOT include siteId in the request body
 *  - Snippets reference SITE_GUARD_KEY (process.env or $-prefixed shell var)
 *  - The env snippet uses the placeholder when no raw key is provided
 *  - The env snippet uses the raw key when one was just created
 */

import { describe, expect, it } from "vitest";
import {
  SITE_GUARD_KEY_PLACEHOLDER,
  buildSiteGuardCurlSnippet,
  buildSiteGuardEnvSnippet,
  buildSiteGuardExpressSnippet,
  buildSiteGuardNextjsSnippet,
} from "@/lib/siteGuardSnippets";

// ---------------------------------------------------------------------------
// curl snippet
// ---------------------------------------------------------------------------

describe("buildSiteGuardCurlSnippet", () => {
  it("includes Authorization: Bearer", () => {
    expect(buildSiteGuardCurlSnippet()).toContain("Authorization: Bearer");
  });

  it("references SITE_GUARD_KEY (shell variable)", () => {
    expect(buildSiteGuardCurlSnippet()).toContain("SITE_GUARD_KEY");
  });

  it("does NOT include siteId in the body", () => {
    expect(buildSiteGuardCurlSnippet()).not.toContain("siteId");
  });

  it("does NOT include domain in the body", () => {
    expect(buildSiteGuardCurlSnippet()).not.toContain('"domain"');
  });

  it("targets the site-guard check endpoint", () => {
    expect(buildSiteGuardCurlSnippet()).toContain("api/site-guard/check");
  });

  it("includes path, userAgent, and agentIdentifier fields", () => {
    const s = buildSiteGuardCurlSnippet();
    expect(s).toContain('"path"');
    expect(s).toContain('"userAgent"');
    expect(s).toContain('"agentIdentifier"');
  });
});

// ---------------------------------------------------------------------------
// Next.js snippet
// ---------------------------------------------------------------------------

describe("buildSiteGuardNextjsSnippet", () => {
  it("includes Authorization: Bearer", () => {
    expect(buildSiteGuardNextjsSnippet()).toContain("Authorization");
    expect(buildSiteGuardNextjsSnippet()).toContain("Bearer");
  });

  it("uses process.env.SITE_GUARD_KEY (server-side reference)", () => {
    expect(buildSiteGuardNextjsSnippet()).toContain("process.env.SITE_GUARD_KEY");
  });

  it("does NOT include siteId as a JSON body key", () => {
    // Comments may mention "siteId" for clarity; the body must not include it as a key.
    expect(buildSiteGuardNextjsSnippet()).not.toContain('"siteId"');
  });

  it("does NOT include domain as a JSON body key", () => {
    expect(buildSiteGuardNextjsSnippet()).not.toContain('"domain"');
  });

  it("targets the site-guard check endpoint", () => {
    expect(buildSiteGuardNextjsSnippet()).toContain("api/site-guard/check");
  });

  it("fails closed with 403 on non-2xx response", () => {
    const s = buildSiteGuardNextjsSnippet();
    expect(s).toContain("403");
    expect(s).toContain("!r.ok");
  });

  it("fails closed with 403 on network error (catch block)", () => {
    const s = buildSiteGuardNextjsSnippet();
    expect(s).toContain("catch");
    expect(s).toContain("403");
  });

  it("includes a NextResponse import reference", () => {
    expect(buildSiteGuardNextjsSnippet()).toContain("NextResponse");
  });

  it("has a matcher config export", () => {
    expect(buildSiteGuardNextjsSnippet()).toContain("matcher");
  });
});

// ---------------------------------------------------------------------------
// Express snippet
// ---------------------------------------------------------------------------

describe("buildSiteGuardExpressSnippet", () => {
  it("includes Authorization: Bearer", () => {
    const s = buildSiteGuardExpressSnippet();
    expect(s).toContain("Authorization");
    expect(s).toContain("Bearer");
  });

  it("uses process.env.SITE_GUARD_KEY", () => {
    expect(buildSiteGuardExpressSnippet()).toContain("process.env.SITE_GUARD_KEY");
  });

  it("does NOT include siteId as a JSON body key", () => {
    // Comments may mention "siteId" for clarity; the body must not include it as a key.
    expect(buildSiteGuardExpressSnippet()).not.toContain('"siteId"');
  });

  it("does NOT include domain as a JSON body key", () => {
    expect(buildSiteGuardExpressSnippet()).not.toContain('"domain"');
  });

  it("targets the site-guard check endpoint", () => {
    expect(buildSiteGuardExpressSnippet()).toContain("api/site-guard/check");
  });

  it("fails closed with 403 when key is missing", () => {
    const s = buildSiteGuardExpressSnippet();
    expect(s).toContain("403");
    expect(s).toContain("SITE_GUARD_KEY");
  });

  it("fails closed with 403 on non-2xx response", () => {
    const s = buildSiteGuardExpressSnippet();
    expect(s).toContain("!r.ok");
    expect(s).toContain("403");
  });

  it("calls next() when allowed", () => {
    expect(buildSiteGuardExpressSnippet()).toContain("next()");
  });
});

// ---------------------------------------------------------------------------
// Env snippet
// ---------------------------------------------------------------------------

describe("buildSiteGuardEnvSnippet", () => {
  it("always starts with SITE_GUARD_KEY=", () => {
    expect(buildSiteGuardEnvSnippet()).toMatch(/^SITE_GUARD_KEY=/);
  });

  it("uses the placeholder when no raw key is provided", () => {
    expect(buildSiteGuardEnvSnippet()).toContain(SITE_GUARD_KEY_PLACEHOLDER);
  });

  it("does not contain the placeholder when a raw key is provided", () => {
    expect(buildSiteGuardEnvSnippet("bhf_site_abc123")).not.toContain(SITE_GUARD_KEY_PLACEHOLDER);
  });

  it("uses the raw key when one was just created", () => {
    expect(buildSiteGuardEnvSnippet("bhf_site_realkey789")).toContain("bhf_site_realkey789");
  });

  it("still starts with SITE_GUARD_KEY= when a raw key is provided", () => {
    expect(buildSiteGuardEnvSnippet("bhf_site_x")).toMatch(/^SITE_GUARD_KEY=/);
  });
});
