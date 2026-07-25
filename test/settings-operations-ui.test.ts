import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { repoPath } from "./helpers/repoPath";

let dashboardSource = "";
let billingSource = "";
let consoleSource = "";
let primitivesSource = "";
let cssSource = "";
let layoutSource = "";

beforeAll(async () => {
  [dashboardSource, billingSource, consoleSource, primitivesSource, cssSource, layoutSource] = await Promise.all([
    readFile(repoPath("app", "dashboard", "client.tsx"), "utf8"),
    readFile(repoPath("app", "dashboard", "billing", "client.tsx"), "utf8"),
    readFile(repoPath("app", "console", "client.tsx"), "utf8"),
    readFile(repoPath("components", "dashboard", "OperationsPrimitives.tsx"), "utf8"),
    readFile(repoPath("app", "settings-operations.css"), "utf8"),
    readFile(repoPath("app", "layout.tsx"), "utf8")
  ]);
});

describe("workspace operations administration", () => {
  it("uses only existing administration destinations", () => {
    expect(primitivesSource).toContain('subpath: "/settings"');
    expect(primitivesSource).toContain('subpath: "/billing"');
    expect(primitivesSource).toContain('subpath: "/webhooks"');
    expect(primitivesSource).toContain('subpath: "/sites"');
    expect(primitivesSource).not.toContain('subpath: "/usage"');
    expect(primitivesSource).not.toContain('subpath: "/security"');
  });

  it("keeps account, workspace, members, developer access, and destructive actions distinct", () => {
    for (const id of ["account", "workspace", "members", "developer-access", "danger-zone"]) {
      expect(dashboardSource).toContain(`id="${id}"`);
    }
    expect(dashboardSource).toContain('eyebrow="Account-level"');
    expect(dashboardSource).toContain('eyebrow="Workspace-level"');
    expect(dashboardSource).toContain('tone="danger"');
  });

  it("preserves one-time secret and masked-preview communication", () => {
    expect(primitivesSource).toContain("navigator.clipboard.writeText(value)");
    expect(dashboardSource).toContain("stores only a hash");
    expect(dashboardSource).toContain("masked preview");
    expect(dashboardSource).toContain("cannot be recovered later");
    expect(consoleSource).toContain("Only its hash and masked preview remain available");
  });

  it("does not change dashboard request paths or fixed webhook creation payload", () => {
    expect(dashboardSource).toContain('api<{ secret: string }>("/api/dashboard/webhooks"');
    expect(dashboardSource).toContain("body: JSON.stringify({ url, events })");
    expect(dashboardSource).toContain('api("/api/dashboard/settings"');
    expect(dashboardSource).toContain('api<{ token: string }>("/api/dashboard/tokens"');
    expect(dashboardSource).toContain("body: JSON.stringify({ email, role })");
  });
});

describe("verified billing and Site Guard presentation", () => {
  it("limits plan comparison and enterprise copy to entitlement-backed values", () => {
    expect(billingSource).toContain('getPlanEntitlements("pro")');
    expect(billingSource).toContain('getPlanEntitlements("enterprise")');
    expect(billingSource).not.toContain("Custom SLA");
    expect(billingSource).not.toContain("SSO / SAML");
    expect(billingSource).not.toContain("Custom contracts and invoicing");
    expect(billingSource).toContain('plan === "free" || plan === "pro"');
  });

  it("describes Site Guard as server-side, deny-by-default route enforcement", () => {
    expect(dashboardSource).toContain("Server-side boundary");
    expect(dashboardSource).toContain("Deny by default");
    expect(dashboardSource).toContain("Fail closed");
    expect(consoleSource).toContain("protected routes");
    expect(consoleSource).not.toContain("restrict API access to known origins");
  });
});

describe("responsive and accessible operations layer", () => {
  it("loads after the approved dashboard product layers", () => {
    const operationsIndex = layoutSource.indexOf('import "./settings-operations.css"');
    expect(operationsIndex).toBeGreaterThan(layoutSource.indexOf('import "./dashboard-shell.css"'));
    expect(operationsIndex).toBeGreaterThan(layoutSource.indexOf('import "./profiles-integrations.css"'));
  });

  it("defines desktop, tablet, and narrow-mobile layouts without page overflow", () => {
    expect(cssSource).toContain("grid-template-columns: minmax(185px, 0.24fr) minmax(0, 1fr)");
    expect(cssSource).toContain("@media (max-width: 1024px)");
    expect(cssSource).toContain("@media (max-width: 768px)");
    expect(cssSource).toContain("@media (max-width: 520px)");
    expect(cssSource).toContain("overflow-wrap: anywhere");
    expect(cssSource).toContain("overflow-x: auto");
  });

  it("keeps text status, focus, live-region, and reduced-motion behavior", () => {
    expect(primitivesSource).toContain('aria-current={item.area === current ? "page" : undefined}');
    expect(primitivesSource).toContain('aria-label="Workspace administration"');
    expect(primitivesSource).toContain('role="status"');
    expect(cssSource).toContain(":focus-visible");
    expect(cssSource).toContain("@media (prefers-reduced-motion: reduce)");
    expect(dashboardSource).toContain('role="alert"');
  });
});
