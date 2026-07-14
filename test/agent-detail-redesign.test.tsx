import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AgentIntegrations } from "@/components/dashboard/agent-detail/AgentIntegrations";
import { AgentOverview } from "@/components/dashboard/agent-detail/AgentOverview";
import { buildAgentActivityQuery } from "@/components/dashboard/agent-detail/activityFilters";
import { PermissionDetails } from "@/components/dashboard/agent-detail/PermissionDetails";
import {
  permissionDraftsFromTemplate,
  permissionToDraft
} from "@/components/dashboard/agent-detail/permissionDrafts";
import type {
  AgentDetail,
  AgentPermission,
  SecurityPosture
} from "@/components/dashboard/agent-detail/types";
import { WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";
import { POLICY_TEMPLATES } from "@/lib/policyTemplates";
import { workspaceDashboardHref } from "@/lib/workspaceSlug";

vi.mock("@/components/ui", () => ({
  Badge: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  ButtonLink: ({ children, href }: { children?: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
  CodeBlock: ({ children, label }: { children?: React.ReactNode; label: string }) => <pre data-label={label}>{children}</pre>,
  EmptyState: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  StatCard: ({ label, value }: { label: string; value: React.ReactNode }) => <div><span>{label}</span><strong>{value}</strong></div>
}));

const permission: AgentPermission = {
  permissionId: "perm_shell_old",
  action: "execute_command",
  resource: "shell",
  status: "active",
  requiresApproval: false,
  requiredAuthorityLevel: 80,
  allowedActions: ["run tests"],
  blockedActions: ["deploy production"],
  constraints: {
    deniedCommands: ["rm -rf", "curl"],
    allowedPaths: ["src/**"],
    deniedPaths: ["**/.env"],
    allowedVendors: ["vendor.example"],
    maxAmount: 25,
    expiresAt: "2030-01-01T00:00:00.000Z"
  },
  lastUsedAt: "2026-07-14T12:00:00.000Z"
};

const agent: AgentDetail = {
  agentId: "agent_test",
  name: "Pilot Agent",
  status: "active",
  agentType: "connected",
  provider: "claude",
  connectionStatus: "connected",
  publicPassportEnabled: true,
  guidelines: []
};

const posture: SecurityPosture = {
  activePermissions: 1,
  approvalGatedPermissions: 0,
  revokedPermissions: 2,
  recentDeniedActions: 3,
  recentDeniedSince: "2026-07-07T00:00:00.000Z"
};

function workspace(element: React.ReactNode) {
  return renderToStaticMarkup(<WorkspaceProvider workspaceSlug="alpha">{element}</WorkspaceProvider>);
}

describe("agent detail information architecture", () => {
  it("uses workspace-scoped route-backed sections", async () => {
    expect(workspaceDashboardHref("alpha", "/agents/agent_test/permissions"))
      .toBe("/alpha/dashboard/agents/agent_test/permissions");

    const shell = await readFile(join(process.cwd(), "components/dashboard/agent-detail/AgentDetailShell.tsx"), "utf8");
    const workspaceRoute = await readFile(
      join(process.cwd(), "app/workspace/[workspaceSlug]/dashboard/agents/[agentId]/[section]/page.tsx"),
      "utf8"
    );
    expect(shell).toContain("Overview");
    expect(shell).toContain("Permissions");
    expect(shell).toContain("Integrations");
    expect(shell).toContain("Activity");
    expect(workspaceRoute).toContain("isAgentDetailSection");
    expect(workspaceRoute).toContain("agentSection={section}");
  });

  it("keeps Overview focused and excludes logs, integration setup, and permission editing", () => {
    const html = workspace(<AgentOverview agent={agent} posture={posture} reload={async () => undefined} />);
    expect(html).toContain("Security posture");
    expect(html).toContain("Identity and status");
    expect(html).toContain("Guidelines");
    expect(html).toContain("Danger area");
    expect(html).not.toContain("Recent logs");
    expect(html).not.toContain("SDK setup");
    expect(html).not.toContain("Add permission");
  });

  it("includes responsive styles for the extracted workspace", async () => {
    const css = await readFile(join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toContain(".agent-detail-shell");
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain(".permission-replacement-review");
  });
});

describe("permission detail and draft behavior", () => {
  it("renders every meaningful constraint and no misleading approver for ungated permissions", () => {
    const html = renderToStaticMarkup(<PermissionDetails permission={permission} />);
    expect(html).toContain("Denied commands");
    expect(html).toContain("rm -rf");
    expect(html).toContain("Allowed paths");
    expect(html).toContain("Denied paths");
    expect(html).toContain("Allowed vendors");
    expect(html).toContain("Amount limit");
    expect(html).toContain("Allowed actions");
    expect(html).toContain("Blocked actions");
    expect(html).toContain("Last used");
    expect(html).toContain("perm_shell_old");
    expect(html).toContain("No approval required");
    expect(html).not.toContain("Minimum approver");
    expect(html).not.toContain("Engineering Lead");
  });

  it("shows the correct minimum approver only when approval is enabled", () => {
    const html = renderToStaticMarkup(
      <PermissionDetails permission={{ ...permission, requiresApproval: true }} />
    );
    expect(html).toContain("Approval required");
    expect(html).toContain("Minimum approver");
    expect(html).toContain("Engineering Lead");
  });

  it("prefills replacement drafts without losing deniedCommands", () => {
    const draft = permissionToDraft(permission);
    expect(draft.requiresApproval).toBe(false);
    expect(draft.constraints.deniedCommands).toEqual(["rm -rf", "curl"]);
    draft.requiresApproval = true;
    expect(draft.constraints.deniedCommands).toEqual(["rm -rf", "curl"]);
  });

  it("turns multi-permission templates into review drafts without performing writes", () => {
    const template = POLICY_TEMPLATES.find((item) => item.id === "coding_agent_deploy")!;
    const drafts = permissionDraftsFromTemplate(template);
    expect(drafts).toHaveLength(2);
    expect(drafts.map((draft) => draft.requiresApproval)).toEqual([false, true]);
    expect(drafts[1].blockedActions).toContain("rollback without approval");
  });

  it("does not offer replacement for a revoked permission", async () => {
    const source = await readFile(join(process.cwd(), "components/dashboard/agent-detail/AgentPermissions.tsx"), "utf8");
    expect(source).toContain('permission.status === "active"');
    expect(source).toContain("Replace permission");
    expect(source).not.toContain('permission.status === "revoked" ? <Button');
  });

  it("routes replacement through a human-authorized server operation", async () => {
    const source = await readFile(
      join(process.cwd(), "app/api/dashboard/agents/[agentId]/permissions/[permissionId]/replace/route.ts"),
      "utf8"
    );
    expect(source).toContain("requireHumanDeveloperApi");
    expect(source).toContain("replacePermissionForAgent");
    expect(source).not.toContain("canUpdatePermission: true");
  });
});

describe("agent activity and credential safety", () => {
  it("builds a bounded, agent-scoped paginated activity query with all filters", () => {
    const path = buildAgentActivityQuery("agent_test", {
      decision: "approval_required",
      action: "execute_command",
      resource: "shell",
      from: "2026-07-01",
      to: "2026-07-14"
    }, 2, 20);
    const url = new URL(path, "http://localhost");
    expect(url.searchParams.get("agentId")).toBe("agent_test");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("decision")).toBe("approval_required");
    expect(url.searchParams.get("action")).toBe("execute_command");
    expect(url.searchParams.get("resource")).toBe("shell");
    expect(url.searchParams.get("from")).toBeTruthy();
    expect(url.searchParams.get("to")).toBeTruthy();
  });

  it("never renders stored credential previews", () => {
    const agentWithStoredPreview = {
      ...agent,
      publicPassportTokenPreview: "stored-passport-preview-must-not-render",
      apiKey: "stored-api-key-must-not-render"
    } as AgentDetail;
    const html = workspace(
      <AgentIntegrations agent={agentWithStoredPreview} permissions={[permission]} reload={async () => undefined} />
    );
    expect(html).not.toContain("stored-passport-preview-must-not-render");
    expect(html).not.toContain("stored-api-key-must-not-render");
    expect(html.match(/verify\.ts/g)).toHaveLength(1);
  });
});
