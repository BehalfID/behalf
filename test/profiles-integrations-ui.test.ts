import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("managed profiles and integrations presentation", () => {
  it("uses shared operational badges for real stored states", () => {
    const primitives = source("components/dashboard/ProfileIntegrationPrimitives.tsx");

    expect(primitives).toContain("EnforcementModeBadge");
    expect(primitives).toContain("ProfileStatusBadge");
    expect(primitives).toContain("ConnectionStatusBadge");
    expect(primitives).toContain("ProtectedRepositoryStatusBadge");
    expect(primitives).toContain('manual: { label: "Manual setup"');
    expect(primitives).toContain('disconnected: { label: "Disconnected"');
    expect(primitives).toContain('disconnected: { label: "Disconnected", variant: "neutral" }');
    expect(primitives).toContain('<OperationalBadge label="Experimental" variant="accent" />');
  });

  it("keeps the workspace policy honest about mode and outage semantics", () => {
    const profiles = source("components/dashboard/ManagedProfilesView.tsx");

    expect(profiles).toContain("Repository → tool → hours → default");
    expect(profiles).toContain("Managed mode is not an outage fail-closed boundary.");
    expect(profiles).toContain("A fresh cached required decision fails closed.");
    expect(profiles).toContain("Without a valid cache, the current CLI can continue unmanaged.");
    expect(profiles).toContain("They do not store allowed-tool");
    expect(profiles).toContain("denied-command rules");
  });

  it("uses semantic tables with mobile field labels for tools and repositories", () => {
    const profiles = source("components/dashboard/ManagedProfilesView.tsx");
    const css = source("app/profiles-integrations.css");

    expect(profiles).toContain("<Table");
    expect(profiles).toContain('data-label="Repository hash"');
    expect(profiles).toContain('data-label="Effective rule path"');
    expect(css).toContain("content: attr(data-label)");
    expect(css).toContain("@media (max-width: 859px)");
    expect(css).toContain("@media (max-width: 480px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps agent integration paths scoped to the selected identity", () => {
    const integrations = source("components/dashboard/agent-detail/AgentIntegrations.tsx");

    expect(integrations).toContain("Credential status");
    expect(integrations).toContain("Passport and manual integration");
    expect(integrations).toContain("External integration metadata");
    expect(integrations).toContain("Ollama tool gating");
    expect(integrations).toContain("@behalfid/sdk/adapters/ollama");
    expect(integrations).not.toContain("Google Antigravity");
  });
});
