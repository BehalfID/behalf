"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { OpsLogConsole } from "@/components/dashboard/OpsLogConsole";
import { PendingActionsQueue } from "@/components/dashboard/PendingActionsQueue";
import { FirstAgentSetup } from "@/components/dashboard/first-agent/FirstAgentSetup";
import { ManagedProfilesView } from "@/components/dashboard/ManagedProfilesView";
import { ManagedProfileActivityView } from "@/components/dashboard/ManagedProfileActivityView";
import { OpsInboxConsole } from "@/components/dashboard/OpsInboxConsole";
import {
  formatPauseApprovalDetails,
  formatPauseApprovalTitle,
  isManagedProfilePauseApproval,
} from "@/components/dashboard/opsLogTypes";
import { CLI_NPM_INSTALL_COMMAND } from "@/lib/cliInstallCommands";
import { DashboardShellLayout } from "@/components/layout/DashboardShell";
import { Badge, Button, ButtonLink, Card, CodeBlock, EmptyState, PageHeader, StatCard } from "@/components/ui";
import {
  CountedUsageLimitTile,
  InfoUsageLimitTile,
  WebhookUsageLimitTile
} from "@/components/usage/UsageLimitTile";
import { SCOPE_TEMPLATES } from "@/lib/scopeTemplates";
import { useDashboardApi, useDashboardPaths, useOptionalWorkspace } from "@/components/workspace/WorkspaceProvider";
import { getRequiredRoleLabel } from "@/lib/authority";
import { classifyPermissionRisk } from "@/lib/permissionRisk";
import { POLICY_TEMPLATES, POLICY_CATEGORY_LABELS, type PolicyTemplate } from "@/lib/policyTemplates";
import { PASSPORT_PRESETS, buildPresetPermissions, type PassportPreset } from "@/lib/passportPresets";
import {
  buildSiteGuardCurlSnippet,
  buildSiteGuardEnvSnippet,
  buildSiteGuardExpressSnippet,
  buildSiteGuardNextjsSnippet,
} from "@/lib/siteGuardSnippets";
import {
  AGENT_TOOL_LABELS,
  AGENT_TOOLS,
  CONTROL_AREA_LABELS,
  CONTROL_AREAS,
  CONTROL_POLICY_HINTS,
  PRIMARY_GOAL_LABELS,
  PRIMARY_GOALS,
  type AgentTool,
  type ControlArea
} from "@/lib/onboarding";
import { SUPPORT_EMAIL } from "@/lib/support";

type Agent = {
  agentId: string;
  name: string;
  status: string;
  agentType: "native" | "connected";
  provider: AgentProvider;
  connectionStatus: "manual" | "connected" | "disconnected";
  externalAgentId?: string | null;
  externalAgentLabel?: string | null;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastUsedAt?: string | null;
  keyRotatedAt?: string | null;
  publicPassportTokenPreview?: string | null;
  publicPassportEnabled?: boolean;
  guidelines?: string[];
};
type PermissionTemplate = "access_data" | "create_content" | "schedule" | "purchase" | "custom";
type Permission = {
  permissionId: string;
  action: string;
  status: string;
  description?: string;
  resource?: string;
  scope?: string;
  allowedActions?: string[];
  blockedActions?: string[];
  requiresApproval?: boolean;
  notes?: string;
  template?: PermissionTemplate;
  constraints?: { maxAmount?: number; allowedVendors?: string[]; expiresAt?: string };
  requiredAuthorityLevel?: number;
};
type WorkspaceAuthority = {
  role: string;
  roleLabel: string;
  authorityLevel: number;
};
type Log = {
  requestId: string;
  agentId: string;
  agentName?: string | null;
  permissionId?: string | null;
  action: string;
  amount?: number;
  vendor?: string | null;
  allowed: boolean;
  approvalRequired?: boolean;
  reason: string;
  risk: "low" | "medium" | "high";
  createdAt?: string;
};
type LogSummary = {
  total: number;
  allowed: number;
  denied: number;
  highRisk: number;
  approvalRequired: number;
  topDeniedAction: string | null;
  topVendor: string | null;
};
type Webhook = { webhookId: string; url: string; events: string[]; status: string; secretPreview: string; lastTriggeredAt?: string | null };
type Delivery = { deliveryId: string; eventType: string; eventId: string; status: string; error?: string; attempt: number; maxAttempts?: number; createdAt?: string };
type DeveloperToken = { tokenId: string; name: string; tokenPreview?: string | null; createdAt?: string; lastUsedAt?: string | null };
type Site = { siteId: string; name: string; domain: string; status: "active" | "disabled"; createdAt?: string };
type SiteRule = {
  ruleId: string;
  name: string;
  status: "active" | "disabled";
  agentIdentifier?: string | null;
  userAgentPattern?: string | null;
  allowedPaths: string[];
  blockedPaths: string[];
  requiresApproval: boolean;
  notes?: string | null;
};
type SiteLog = {
  requestId: string;
  ruleId?: string | null;
  path: string;
  userAgent: string;
  agentIdentifier?: string | null;
  allowed: boolean;
  reason: string;
  risk: "low" | "medium" | "high";
  createdAt?: string;
};
type SiteGuardKey = {
  keyId: string;
  siteId: string;
  name: string;
  keyPreview: string;
  status: "active" | "revoked";
  lastUsedAt?: string | null;
  createdAt?: string;
};
type ApprovalRequest = {
  approvalId: string;
  requestId: string;
  kind?: "agent_action" | "managed_profile_pause" | null;
  agentId: string;
  agentName?: string | null;
  requesterName?: string | null;
  permissionId: string;
  action: string;
  vendor?: string | null;
  amount?: number | null;
  argumentKind?: "command" | "file_path" | null;
  argumentPreview?: string | null;
  argumentPreviewTruncated?: boolean | null;
  legacyUnbound?: boolean | null;
  status: "pending" | "approved" | "denied" | "used";
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  usedAt?: string | null;
  grantExpiresAt?: string | null;
  createdAt?: string;
  requiredAuthorityLevel?: number;
  requiredRoleLabel?: string;
  canApprove?: boolean;
  canDeny?: boolean;
  approveBlockReason?: string | null;
  denyBlockReason?: string | null;
  pauseTool?: string | null;
  pauseRepo?: string | null;
  pauseBranch?: string | null;
  pauseDeviceId?: string | null;
  pauseScope?: "current_repo" | "all" | null;
  requestedDurationMinutes?: number | null;
  pauseReason?: string | null;
  contextReason?: string | null;
};
type AccountMember = {
  membershipId: string;
  userId: string;
  email: string | null;
  role: string;
  status: "active";
};
type PendingInvite = {
  inviteId: string;
  email: string;
  role: string;
  status: "pending";
  acceptUrl?: string | null;
};
type AgentProvider = "custom" | "ollie" | "chatgpt" | "claude" | "gemini" | "zapier" | "make" | "langchain" | "openai" | "other";
type ProviderSelection = AgentProvider | "";
type Plan = "free" | "pro" | "team" | "business" | "enterprise";
type UsageSummary = {
  plan: Plan;
  seatCount: number;
  seatLimit: number | null;
  agentCount: number;
  agentLimit: number | null;
  protectedRepoCount: number;
  protectedRepoLimit: number | null;
  verificationCount: number;
  verificationLimit: number | null;
  verificationPeriodStart: string;
  verificationPeriodResetAt: string;
  webhooksEnabled: boolean;
  logRetentionDays: number;
  stripeSubscriptionStatus: string | null;
};
type OnboardingUserPath = "developer" | "regular" | null;
type OnboardingUseCase = "personal" | "website" | "sdk";
type DraftConstraints = {
  maxAmount?: number;
  allowedVendors?: string[];
  expiresAt?: null;
};
type DraftPermission = {
  action: string;
  resource: string;
  allowedActions: string[];
  blockedActions: string[];
  requiresApproval: boolean;
  status: "active";
  constraints?: DraftConstraints;
  riskLevel: "low" | "medium" | "high";
  reason: string;
};
type PermissionDraftResponse = {
  agentDraft: { provider: string; description: string };
  permissions: DraftPermission[];
  needsClarification: { question: string; reason: string }[];
  warnings: string[];
  limitations: string[];
};
type VerifyResult = { requestId: string; allowed: boolean; reason: string; risk: string };

const permissionTemplates: Array<{ value: PermissionTemplate; title: string; body: string }> = [
  { value: "access_data", title: "Access data", body: "Read from a service or dataset without granting write access." },
  { value: "create_content", title: "Create or send content", body: "Draft, create, or send messages and records with approval controls." },
  { value: "schedule", title: "Schedule or coordinate", body: "Suggest times, create draft events, or book meetings inside a workflow." },
  { value: "purchase", title: "Purchase or transaction", body: "Allow buying or payment-like actions under vendor and amount limits." },
  { value: "custom", title: "Custom permission", body: "Define your own action, resource, and constraints." }
];

const providerOptions: Array<{ value: AgentProvider; label: string }> = [
  { value: "ollie", label: "Ollie" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "claude", label: "Claude" },
  { value: "gemini", label: "Gemini" },
  { value: "zapier", label: "Zapier" },
  { value: "make", label: "Make" },
  { value: "langchain", label: "LangChain" },
  { value: "openai", label: "OpenAI" },
  { value: "custom", label: "Custom" },
  { value: "other", label: "Other" }
];

const regularProviderOptions: Array<{ value: AgentProvider; label: string; description: string }> = [
  { value: "chatgpt", label: "ChatGPT", description: "OpenAI's ChatGPT" },
  { value: "claude", label: "Claude", description: "Anthropic's Claude" },
  { value: "gemini", label: "Gemini", description: "Google's Gemini" },
  { value: "ollie", label: "Ollie", description: "Ollie personal assistant" },
  { value: "zapier", label: "Zapier", description: "Zapier automation" },
  { value: "make", label: "Make", description: "Make (formerly Integromat)" },
  { value: "other", label: "Custom / Other", description: "Another AI assistant" }
];

const DESCRIPTION_EXAMPLES = [
  "Browse the web and summarize public pages, but do not submit forms, log in, or buy anything.",
  "Read and summarize my emails, but do not send, delete, forward, or change filters.",
  "Compare products and make purchases under $25 only after I approve them.",
  "Help schedule meetings by reading my calendar, but ask before creating, changing, or deleting events."
];

const FIRST_AGENT_EXAMPLES = [
  { title: "Coding agent", body: "Allow staging deploys. Require approval before production. Deny secret access and destructive repo actions." },
  { title: "Research agent", body: "Allow web research and public page reads. Deny checkout, forms, and account access." },
  { title: "Shopping agent", body: "Allow product comparison. Allow purchases only under $25 from approved vendors." }
];

const FIRST_PERMISSION_EXAMPLES = [
  "Allow web browsing",
  "Allow calendar read",
  "Allow purchases up to $25",
  "Deny checkout or sending email"
];

const dashboardUseCaseContent: Record<OnboardingUseCase, {
  kicker: string;
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
  steps: Array<{ title: string; body: string; href: string }>;
}> = {
  personal: {
    kicker: "Manual passport path",
    title: "Create a permission passport for an assistant you already use.",
    body: "Start with a simple passport, review the drafted boundaries, then paste the instructions into the assistant.",
    actionLabel: "Create passport",
    actionHref: "/dashboard/onboarding",
    steps: [
      { title: "Choose assistant", body: "Pick ChatGPT, Claude, Gemini, Ollie, Zapier, Make, or another tool.", href: "/dashboard/onboarding" },
      { title: "Describe the job", body: "State what it can do, what it must not do, and any spending or vendor limits.", href: "/dashboard/onboarding" },
      { title: "Review passport", body: "Confirm allowed actions, blocked actions, approval requirements, and limits.", href: "/dashboard/agents" },
      { title: "Paste instructions", body: "Add the passport instructions to the assistant and keep enforcement expectations explicit.", href: "/dashboard/docs" }
    ]
  },
  website: {
    kicker: "Website owner path",
    title: "Prepare boundaries for AI agents and crawlers visiting your site.",
    body: "Use the dashboard to model site access, represent the agent or gateway, and inspect decision logs before protected workflows run.",
    actionLabel: "Create site agent",
    actionHref: "/dashboard/docs",
    steps: [
      { title: "Map protected actions", body: "Identify public reads, form submits, checkout, account, or content workflows.", href: "/dashboard/docs" },
      { title: "Create site agent", body: "Represent the agent or gateway that will check requests before site actions execute.", href: "/dashboard/onboarding" },
      { title: "Define site rules", body: "Set resources, blocked actions, approval needs, and limits for risky workflows.", href: "/dashboard/agents" },
      { title: "Review events", body: "Use logs and webhooks to inspect allowed, denied, and failed decisions.", href: "/dashboard/logs" }
    ]
  },
  sdk: {
    kicker: "SDK developer path",
    title: "Create a guarded agent and verify its first test action.",
    body: "Get to the core loop quickly: create an agent, define a boundary, call verify(), and inspect the audit event.",
    actionLabel: "Add agent",
    actionHref: "/dashboard/onboarding",
    steps: [
      { title: "Add agent", body: "Create a native identity and store the one-time API key in your environment.", href: "/dashboard/onboarding" },
      { title: "Create permission", body: "Define the action, resource, spending limit, expiration, and approval requirement.", href: "/dashboard/agents" },
      { title: "Install SDK", body: "Use @behalfid/sdk from Node 18+ and call verify before tool execution.", href: "/docs/sdk" },
      { title: "Verify before acting", body: "Fail closed on denied decisions and use request IDs for debugging.", href: "/dashboard/docs" }
    ]
  }
};

function useResource<T>(path: string) {
  const { apiJson, workspaceSlug } = useDashboardApi();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      setError("");
      setData(await apiJson<T>(path));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed.");
    }
  }, [path, apiJson]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setError("");
        const result = await apiJson<T>(path);
        if (!cancelled) setData(result);
      } catch (requestError) {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Request failed.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [path, apiJson, workspaceSlug]);
  return { data, error, reload };
}

async function legacyUnscopedApiRemoved(): Promise<never> {
  throw new Error("Use useDashboardApi().apiJson inside React components.");
}

void legacyUnscopedApiRemoved;

function date(value?: string | null) {
  return value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "Never";
}

const INCOMPLETE_SETUP_BANNER =
  "Add your profile and workspace details so BehalfID can tailor approvals and controls."; // pragma: allowlist secret

export function DashboardViews({
  view,
  id,
  emailVerified = true,
  showSetupBanner = false
}: {
  view: "home" | "onboarding" | "first-agent" | "agents" | "agent" | "sites" | "webhooks" | "webhook" | "logs" | "approvals" | "inbox" | "docs" | "settings" | "managed-profiles" | "managed-profiles-activity";
  id?: string;
  emailVerified?: boolean;
  showSetupBanner?: boolean;
}) {
  return (
    <>
        {!emailVerified ? (
          <div className="dashboard-banner dashboard-banner--warning" role="status">
            <strong>Verify your email.</strong> Agent creation and API tokens stay locked until verification is complete.{" "}
            <Link href="/verify-email">Verify now</Link>
          </div>
        ) : null}
        {showSetupBanner ? (
          <div className="dashboard-banner" role="status">
            <strong>Finish account setup.</strong> {INCOMPLETE_SETUP_BANNER}{" "}
            <Link href="/onboarding">Complete setup</Link>
          </div>
        ) : null}
        {view === "home" ? <HomeView /> : null}
        {view === "onboarding" ? <OnboardingView /> : null}
        {view === "first-agent" ? <FirstAgentSetupView emailVerified={emailVerified} /> : null}
        {view === "agents" ? <AgentsView /> : null}
        {view === "agent" && id ? <AgentView agentId={id} /> : null}
        {view === "sites" ? <SitesView /> : null}
        {view === "webhooks" ? <WebhooksView /> : null}
        {view === "webhook" && id ? <WebhookView webhookId={id} /> : null}
        {view === "logs" ? <LogsView /> : null}
        {view === "approvals" ? <ApprovalsView /> : null}
        {view === "inbox" ? <InboxView /> : null}
        {view === "docs" ? <DashboardDocs /> : null}
        {view === "settings" ? <SettingsView /> : null}
        {view === "managed-profiles" ? <ManagedProfilesView /> : null}
        {view === "managed-profiles-activity" ? <ManagedProfileActivityView /> : null}
    </>
  );
}

export function DashboardShell({
  view,
  id,
  emailVerified = true,
  showSetupBanner = false
}: {
  view: "home" | "onboarding" | "first-agent" | "agents" | "agent" | "sites" | "webhooks" | "webhook" | "logs" | "approvals" | "inbox" | "docs" | "settings" | "managed-profiles" | "managed-profiles-activity";
  id?: string;
  emailVerified?: boolean;
  showSetupBanner?: boolean;
}) {
  return (
    <DashboardShellLayout>
      <DashboardViews
        view={view}
        id={id}
        emailVerified={emailVerified}
        showSetupBanner={showSetupBanner}
      />
    </DashboardShellLayout>
  );
}

const HOME_CONTROL_ROUTES: Record<string, string> = {
  production_deploys: "/dashboard/onboarding?setup=deploy-approvals",
  github_writes: "/dashboard/onboarding?setup=profiles",
  db_migrations: "/dashboard/onboarding",
  secrets: "/dashboard/onboarding",
  billing_vendor_apis: "/dashboard/onboarding",
  external_comms: "/dashboard/onboarding",
  other: "/dashboard/onboarding"
};

function feedTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function FirstAgentSetupView({ emailVerified }: { emailVerified: boolean }) {
  return (
    <Suspense fallback={<div className="setup-loading">Loading agent setup…</div>}>
      <FirstAgentSetupViewInner emailVerified={emailVerified} />
    </Suspense>
  );
}

function FirstAgentSetupViewInner({ emailVerified }: { emailVerified: boolean }) {
  const searchParams = useSearchParams();
  const summary = useResource<{
    accountOnboarding?: { agentTools?: AgentTool[] } | null;
  }>("/api/dashboard/summary");
  const suggestedSurfaces = summary.data?.accountOnboarding?.agentTools ?? [];
  const focus = searchParams.get("focus");
  return <FirstAgentSetup emailVerified={emailVerified} suggestedSurfaces={suggestedSurfaces} focus={focus} />;
}

function HomeView() {
  const { href: dHref } = useDashboardPaths();
  const summary = useResource<{
    totalAgents: number;
    activePermissions: number;
    logsToday: number;
    pendingEvents: number;
    failedEvents: number;
    onboardingUseCase?: OnboardingUseCase | null;
    accountOnboarding?: {
      controlAreas?: string[];
      agentTools?: string[];
      firstSetupGoal?: string;
    } | null;
    usage: UsageSummary;
  }>("/api/dashboard/summary");
  const inbox = useResource<{ pendingApprovals: ApprovalRequest[]; deniedHighRisk: Log[] }>("/api/dashboard/inbox");
  const activity = useResource<{ logs: Log[] }>("/api/dashboard/logs?limit=8");

  const hasAgents = (summary.data?.totalAgents ?? 0) > 0;
  const controlAreas = (summary.data?.accountOnboarding?.controlAreas ?? []) as ControlArea[];
  const agentTools = (summary.data?.accountOnboarding?.agentTools ?? []) as AgentTool[];
  const firstSetupGoal = summary.data?.accountOnboarding?.firstSetupGoal;

  const pendingApprovals = (inbox.data?.pendingApprovals ?? []).filter((item) => item.status === "pending");
  const recentLogs = activity.data?.logs ?? [];
  const webhookIssues = summary.data?.failedEvents ?? 0;
  const attentionCount = pendingApprovals.length + webhookIssues;
  const systemState = summary.data
    ? attentionCount > 0
      ? { label: "Attention required", tone: "warn" as const }
      : hasAgents
        ? { label: "Operational", tone: "ok" as const }
        : { label: "Awaiting configuration", tone: "idle" as const }
    : { label: "Loading", tone: "idle" as const };

  const nextActions = [
    !hasAgents
      ? { title: "Register your first agent", body: "Issue a governed identity and scoped API key.", href: dHref("/dashboard/agents/new") }
      : null,
    firstSetupGoal === "invite_team"
      ? { title: "Invite your team", body: "Share approval authority with leads and engineers.", href: dHref("/dashboard/settings?panel=members") }
      : null,
    firstSetupGoal === "explore_sandbox"
      ? { title: "Open the sandbox", body: "Exercise enforcement before connecting production agents.", href: "/sandbox" }
      : null,
    agentTools.includes("github_actions") && !hasAgents
      ? { title: "Register CI agents", body: "Give GitHub Actions workflows their own identity.", href: dHref("/dashboard/agents/new") }
      : null
  ].filter(Boolean) as Array<{ title: string; body: string; href: string }>;

  const headerAction = !hasAgents
    ? { label: "Set up first agent", href: dHref("/dashboard/agents/new") }
    : pendingApprovals.length > 0
      ? { label: "Review approvals", href: dHref("/dashboard/approvals") }
      : firstSetupGoal === "setup_deploy_approvals"
        ? { label: "Configure deploy approvals", href: dHref("/dashboard/onboarding?setup=deploy-approvals") }
        : { label: "Add agent", href: dHref("/dashboard/onboarding") };

  return (
    <>
      <Header
        title="Control plane"
        description="Current state of agents, policies, and decisions in this workspace."
        action={<ButtonLink variant="primary" href={headerAction.href}>{headerAction.label}</ButtonLink>}
      />
      {summary.error ? <p className="form-error" role="alert">{summary.error}</p> : null}

      <section className="ops-strip" aria-label="System status">
        <div className="ops-strip__state">
          <span className={`cx-dot${systemState.tone === "warn" ? " cx-dot--warn" : systemState.tone === "idle" ? " cx-dot--idle" : ""}`} aria-hidden="true" />
          {systemState.label}
        </div>
        <dl className="ops-strip__seg">
          <dt>Agents</dt>
          <dd>{summary.data?.totalAgents ?? "—"}</dd>
        </dl>
        <dl className="ops-strip__seg">
          <dt>Permissions</dt>
          <dd>{summary.data?.activePermissions ?? "—"}</dd>
        </dl>
        <dl className={`ops-strip__seg${pendingApprovals.length > 0 ? " ops-strip__seg--alert" : ""}`}>
          <dt>Pending approvals</dt>
          <dd>{inbox.data ? pendingApprovals.length : "—"}</dd>
        </dl>
        <dl className="ops-strip__seg">
          <dt>Decisions today</dt>
          <dd>{summary.data?.logsToday ?? "—"}</dd>
        </dl>
        <div className="ops-strip__spacer" aria-hidden="true" />
        <Link className="ops-strip__link" href={dHref("/dashboard/logs")}>Audit log →</Link>
      </section>

      <div className="ops-grid">
        <div className="ops-col">
          <section className="ops-panel" aria-label="Approval queue">
            <div className="ops-panel__head">
              <p className="cx-label">Approval queue</p>
              <Link href={dHref("/dashboard/approvals")}>Open queue</Link>
            </div>
            {!inbox.data ? (
              <p className="ops-empty">Loading queue…</p>
            ) : pendingApprovals.length === 0 ? (
              <p className="ops-empty">No approvals waiting. Gated actions pause here for human review before they run.</p>
            ) : (
              <div className="ops-feed">
                {pendingApprovals.slice(0, 5).map((item) => {
                  const pauseApproval = isManagedProfilePauseApproval(item);
                  return (
                  <Link
                    className="ops-feed__row"
                    href={
                      pauseApproval
                        ? dHref(`/dashboard/approvals?highlight=${item.approvalId}`)
                        : dHref("/dashboard/approvals")
                    }
                    key={item.approvalId}
                  >
                    <span className="ops-feed__time">{feedTime(item.createdAt)}</span>
                    <span className="ops-feed__body">
                      <span className="ops-feed__title">
                        {pauseApproval
                          ? formatPauseApprovalTitle(item)
                          : `${item.agentName ?? item.agentId} · ${item.action}`}
                      </span>
                      <span className="ops-feed__meta">
                        {pauseApproval
                          ? formatPauseApprovalDetails(item)
                          : item.requiredRoleLabel
                            ? `Requires ${item.requiredRoleLabel}`
                            : "Awaiting decision"}
                      </span>
                    </span>
                    <span className="cx-chip cx-chip--warn">Pending</span>
                  </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="ops-panel" aria-label="Recent activity">
            <div className="ops-panel__head">
              <p className="cx-label">Recent activity</p>
              <Link href={dHref("/dashboard/logs")}>View all</Link>
            </div>
            {!activity.data ? (
              <p className="ops-empty">Loading activity…</p>
            ) : recentLogs.length === 0 ? (
              <p className="ops-empty">
                No verification events yet. Decisions appear here the moment an agent calls <code>verify</code>.
              </p>
            ) : (
              <div className="ops-feed">
                {recentLogs.map((log) => (
                  <div className="ops-feed__row" key={log.requestId}>
                    <span className="ops-feed__time">{feedTime(log.createdAt)}</span>
                    <span className="ops-feed__body">
                      <span className="ops-feed__title">{log.agentName ?? log.agentId} · <code>{log.action}</code></span>
                      <span className="ops-feed__meta">{log.reason}</span>
                    </span>
                    {log.allowed ? (
                      <span className="cx-chip cx-chip--ok">Allowed</span>
                    ) : log.approvalRequired ? (
                      <span className="cx-chip cx-chip--warn">Approval</span>
                    ) : (
                      <span className="cx-chip cx-chip--deny">Denied</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="ops-col">
          <section className="ops-panel" aria-label="Policy coverage">
            <div className="ops-panel__head">
              <p className="cx-label">Policy coverage</p>
            </div>
            {controlAreas.length === 0 ? (
              <p className="ops-empty">No control boundaries selected during setup. Add them in settings to track coverage here.</p>
            ) : (
              <div className="ops-coverage">
                {controlAreas.map((area) => (
                  <Link className="ops-coverage__row" href={dHref(HOME_CONTROL_ROUTES[area] ?? "/dashboard/onboarding")} key={area}>
                    <span>{CONTROL_AREA_LABELS[area] ?? area}</span>
                    <span className="cx-chip">Not configured</span>
                  </Link>
                ))}
              </div>
            )}
            {controlAreas.length > 0 ? (
              <div className="ops-panel__foot">Boundaries selected at setup. Configure each to move it under enforcement.</div>
            ) : null}
          </section>

          <section className="ops-panel" aria-label="Integration surfaces">
            <div className="ops-panel__head">
              <p className="cx-label">Integration surfaces</p>
            </div>
            {agentTools.length === 0 ? (
              <p className="ops-empty">No agent surfaces registered during setup.</p>
            ) : (
              <div className="ops-coverage">
                {agentTools.map((tool) => (
                  <Link className="ops-coverage__row" href={dHref("/dashboard/onboarding")} key={tool}>
                    <span>{AGENT_TOOL_LABELS[tool] ?? tool}</span>
                    {hasAgents ? (
                      <span className="cx-chip cx-chip--ok">Active</span>
                    ) : (
                      <span className="cx-chip">Awaiting agent</span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>

          {nextActions.length ? (
            <section className="ops-panel" aria-label="Next actions">
              <div className="ops-panel__head">
                <p className="cx-label">Next actions</p>
              </div>
              <div>
                {nextActions.map((item) => (
                  <Link className="ops-next__row" href={item.href} key={item.title}>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.body}</small>
                    </span>
                    <span className="ops-next__arrow" aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {summary.data?.usage ? <PlanUsagePanel usage={summary.data.usage} /> : null}
    </>
  );
}

function formatUsageDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function PlanUsagePanel({ usage }: { usage: UsageSummary }) {
  const { href: dHref } = useDashboardPaths();
  return (
    <section className="dashboard-panel plan-usage-panel">
      <div className="dashboard-section-header">
        <div>
          <p className="section-kicker">Plan and usage</p>
          <h2>{usage.plan.charAt(0).toUpperCase() + usage.plan.slice(1)} plan</h2>
          <p>Current limits, reset timing, webhook access, and log retention.</p>
        </div>
        <ButtonLink href={dHref("/dashboard/billing")}>{usage.plan === "free" ? "Upgrade" : "Manage billing"}</ButtonLink>
      </div>
      {usage.stripeSubscriptionStatus === "past_due" ? (
        <p className="form-error" role="alert">Payment failed. Paid limits and webhook delivery are disabled until billing is updated.</p>
      ) : null}
      <div className="plan-usage-grid">
        <CountedUsageLimitTile kind="seats" label="Seats" used={usage.seatCount} limit={usage.seatLimit} />
        <CountedUsageLimitTile kind="agents" label="Agents" used={usage.agentCount} limit={usage.agentLimit} />
        <CountedUsageLimitTile
          kind="protectedRepos"
          label="Protected repos"
          used={usage.protectedRepoCount}
          limit={usage.protectedRepoLimit}
        />
        <CountedUsageLimitTile
          kind="verifications"
          label="Verifications"
          used={usage.verificationCount}
          limit={usage.verificationLimit}
        />
        <InfoUsageLimitTile
          label="Reset"
          value={formatUsageDate(usage.verificationPeriodResetAt)}
          helper="Verification usage resets at the start of each UTC calendar month."
        />
        <WebhookUsageLimitTile enabled={usage.webhooksEnabled} />
        <InfoUsageLimitTile
          label="Log retention"
          value={`${usage.logRetentionDays} days`}
          helper="Dashboard logs are filtered to this retention window."
        />
      </div>
    </section>
  );
}

function AgentsView() {
  const { href: dHref } = useDashboardPaths();
  const resource = useResource<{ agents: Agent[] }>("/api/dashboard/agents");
  const agents = resource.data?.agents ?? [];
  return (
    <>
      <Header title="Agents" description="Manage the AI agents BehalfID enforces permissions for." action={<ButtonLink variant="primary" href={dHref("/dashboard/agents/new")}>Add agent</ButtonLink>} /> {/* pragma: allowlist secret */}
      {!agents.length && resource.data ? (
        <Card className="dashboard-panel onboarding-callout">
          <h2>Create your first controlled agent.</h2>
          <p>An agent is the AI system or workflow BehalfID identifies before it tries to browse, buy, email, book, edit, or access data. API keys identify it; permissions define what it may do.</p>
          <div className="permission-template-grid permission-template-grid--nested">
            {FIRST_AGENT_EXAMPLES.map((example) => (
              <div className="permission-template" key={example.title}>
                <strong>{example.title}</strong>
                <span>{example.body}</span>
              </div>
            ))}
          </div>
          <div><ButtonLink variant="primary" href={dHref("/dashboard/agents/new")}>Set up your first agent</ButtonLink></div>
        </Card>
      ) : null}
      {agents.length > 0 ? (
        <Rows items={agents} href={(agent) => dHref(`/dashboard/agents/${agent.agentId}`)} title={(agent) => agent.name} meta={(agent) => `${agent.provider} / ${agent.status}`} />
      ) : null}
    </>
  );
}

function sitePaths(value: string) {
  return value
    .split(/\n|,/)
    .map((path) => path.trim())
    .filter(Boolean);
}

function SitesView() {
  const { apiJson: api } = useDashboardApi();
  const resource = useResource<{ sites: Site[] }>("/api/dashboard/sites");
  const sites = resource.data?.sites ?? [];
  const [siteId, setSiteId] = useState("");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [siteError, setSiteError] = useState("");
  const selectedSiteId = siteId || sites[0]?.siteId || "";

  const createSite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSiteError("");
      const result = await api<{ site: Site }>("/api/dashboard/sites", {
        method: "POST",
        body: JSON.stringify({ name, domain })
      });
      setName("");
      setDomain("");
      setSiteId(result.site.siteId);
      await resource.reload();
    } catch (requestError) {
      setSiteError(requestError instanceof Error ? requestError.message : "Site creation failed.");
    }
  };

  return (
    <>
      <Header title="Site Guard" description="Block or allow AI agents from accessing your website paths." action={<ButtonLink href="/docs/site-guard">Integration docs</ButtonLink>} />
      {resource.error ? <p className="form-error" role="alert">{resource.error}</p> : null}
      {siteError ? <p className="form-error" role="alert">{siteError}</p> : null}
      <div className="dashboard-grid">
        <Card className="dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <h2>Sites</h2>
              <p>Checks are deny-by-default until an active rule allows the path.</p>
            </div>
          </div>
          <div className="dashboard-list">
            {sites.map((site) => (
              <button className="dashboard-list-row" key={site.siteId} onClick={() => setSiteId(site.siteId)} type="button">
                <strong>{site.name}</strong>
                <small>{site.domain} / {site.status} / {site.siteId}</small>
              </button>
            ))}
          </div>
          {!sites.length && resource.data ? <EmptyState className="dashboard-empty">No Site Guard sites yet.</EmptyState> : null}
        </Card>
        <form className="dashboard-panel dashboard-form-card" onSubmit={createSite}>
          <h2>Create site</h2>
          <label><span>Name</span><input onChange={(event) => setName(event.target.value)} placeholder="Docs site" required value={name} /></label>
          <label><span>Domain</span><input onChange={(event) => setDomain(event.target.value)} placeholder="docs.example.com" required value={domain} /></label>
          <div><Button variant="primary" type="submit">Create site</Button></div>
        </form>
      </div>
      {selectedSiteId ? <SiteDetailView siteId={selectedSiteId} onChanged={resource.reload} /> : null}
    </>
  );
}

function SiteDetailView({ siteId, onChanged }: { siteId: string; onChanged: () => Promise<void> }) {
  const { apiJson: api } = useDashboardApi();
  const detail = useResource<{ site: Site; rules: SiteRule[]; logs: SiteLog[]; keys: SiteGuardKey[] }>(`/api/dashboard/sites/${siteId}`);
  const [name, setName] = useState("");
  const [signal, setSignal] = useState("");
  const [pattern, setPattern] = useState("");
  const [allowedPaths, setAllowedPaths] = useState("/docs/*");
  const [blockedPaths, setBlockedPaths] = useState("/admin/*");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [keyName, setKeyName] = useState("");
  const [keyError, setKeyError] = useState("");
  const [newKeyData, setNewKeyData] = useState<{ keyId: string; rawKey: string } | null>(null);

  const createRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setDetailError("");
      await api(`/api/dashboard/sites/${siteId}/rules`, {
        method: "POST",
        body: JSON.stringify({
          name,
          agentIdentifier: signal || undefined,
          userAgentPattern: pattern || undefined,
          allowedPaths: sitePaths(allowedPaths),
          blockedPaths: sitePaths(blockedPaths),
          requiresApproval
        })
      });
      setName("");
      await detail.reload();
    } catch (requestError) {
      setDetailError(requestError instanceof Error ? requestError.message : "Rule creation failed.");
    }
  };

  const createKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setKeyError("");
      const result = await api<{ key: SiteGuardKey; rawKey: string }>(`/api/dashboard/sites/${siteId}/keys`, {
        method: "POST",
        body: JSON.stringify({ name: keyName })
      });
      setKeyName("");
      setNewKeyData({ keyId: result.key.keyId, rawKey: result.rawKey });
      await detail.reload();
    } catch (requestError) {
      setKeyError(requestError instanceof Error ? requestError.message : "Key creation failed.");
    }
  };

  const revokeKey = async (keyId: string) => {
    try {
      await api(`/api/dashboard/sites/${siteId}/keys/${keyId}`, { method: "DELETE" });
      if (newKeyData?.keyId === keyId) setNewKeyData(null);
      await detail.reload();
    } catch {
      // revoke errors are surfaced inline
    }
  };

  const setSiteStatus = async (status: Site["status"]) => {
    await api(`/api/dashboard/sites/${siteId}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await Promise.all([detail.reload(), onChanged()]);
  };

  const setRuleStatus = async (rule: SiteRule) => {
    await api(`/api/dashboard/sites/${siteId}/rules/${rule.ruleId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: rule.status === "active" ? "disabled" : "active" })
    });
    await detail.reload();
  };

  if (detail.error) return <p className="form-error" role="alert">{detail.error}</p>;
  const site = detail.data?.site;
  if (!site) return null;

  const hasKeys = (detail.data?.keys ?? []).some((k) => k.status === "active");

  return (
    <>
      <section className="dashboard-grid">
        <Card className="dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="section-kicker">{site.siteId}</p>
              <h2>{site.name}</h2>
              <p>{site.domain} · <Badge>{site.status}</Badge></p>
            </div>
            <Button onClick={() => void setSiteStatus(site.status === "active" ? "disabled" : "active")}>
              {site.status === "active" ? "Disable" : "Enable"}
            </Button>
          </div>
          <h3>Site keys</h3>
          <p>Use a site key (<code>bhf_site_...</code>) in <code>Authorization: Bearer</code> to scope requests to this site only. Keys are narrower than developer tokens.</p>
          {newKeyData ? (
            <div className="secret-panel">
              <strong>Key created — copy now, it will not be shown again.</strong>
              <code>{newKeyData.rawKey}</code>
              <Button onClick={() => setNewKeyData(null)}>Dismiss</Button>
            </div>
          ) : null}
          <div className="dashboard-list">
            {(detail.data?.keys ?? []).map((key) => (
              <div key={key.keyId}>
                <span>
                  <strong>{key.name} <Badge>{key.status}</Badge></strong>
                  <small>{key.keyPreview} / {key.status === "active" && key.lastUsedAt ? `last used ${date(key.lastUsedAt)}` : "never used"}</small>
                </span>
                {key.status === "active" ? <Button onClick={() => void revokeKey(key.keyId)}>Revoke</Button> : null}
              </div>
            ))}
          </div>
          {!(detail.data?.keys ?? []).length && detail.data ? <EmptyState className="dashboard-empty">No site keys yet.</EmptyState> : null}
          <h3>Rules</h3>
          <div className="dashboard-list">
            {detail.data?.rules.map((rule) => (
              <div key={rule.ruleId}>
                <span>
                  <strong>{rule.name} <Badge>{rule.status}</Badge></strong>
                  <small>{rule.agentIdentifier || rule.userAgentPattern} / allow {rule.allowedPaths.join(", ") || "none"} / block {rule.blockedPaths.join(", ") || "none"}</small>
                </span>
                <Button onClick={() => void setRuleStatus(rule)}>{rule.status === "active" ? "Disable" : "Enable"}</Button>
              </div>
            ))}
          </div>
          {!(detail.data?.rules ?? []).length && detail.data ? <EmptyState className="dashboard-empty">No rules yet. Add a rule to allow specific paths.</EmptyState> : null}
          <h3>Recent checks</h3>
          <div className="dashboard-list">
            {detail.data?.logs.map((log) => (
              <div key={log.requestId}>
                <span>
                  <strong>{log.allowed ? "Allowed" : "Denied"} {log.path}</strong>
                  <small>{log.reason} · {log.requestId} · {date(log.createdAt)}</small>
                </span>
                <Badge>{log.risk} risk</Badge>
              </div>
            ))}
          </div>
          {!(detail.data?.logs ?? []).length && detail.data ? <EmptyState className="dashboard-empty">No recent checks.</EmptyState> : null}
        </Card>
        <div className="dashboard-side-forms">
          <form className="dashboard-panel dashboard-form-card" onSubmit={createKey}>
            <h2>Create site key</h2>
            {keyError ? <p className="form-error" role="alert">{keyError}</p> : null}
            <label><span>Name</span><input onChange={(event) => setKeyName(event.target.value)} placeholder="Middleware key" required value={keyName} /></label>
            <div><Button variant="primary" type="submit">Create key</Button></div>
          </form>
          <form className="dashboard-panel dashboard-form-card" onSubmit={createRule}>
            <h2>Add rule</h2>
            {detailError ? <p className="form-error" role="alert">{detailError}</p> : null}
            <label><span>Name</span><input onChange={(event) => setName(event.target.value)} required value={name} /></label>
            <label><span>Agent identifier</span><input onChange={(event) => setSignal(event.target.value)} placeholder="crawler_alpha" value={signal} /></label>
            <label><span>User-Agent pattern</span><input onChange={(event) => setPattern(event.target.value)} placeholder="ExampleBot/*" value={pattern} /></label>
            <label><span>Allowed paths</span><textarea onChange={(event) => setAllowedPaths(event.target.value)} rows={3} value={allowedPaths} /></label>
            <label><span>Blocked paths</span><textarea onChange={(event) => setBlockedPaths(event.target.value)} rows={3} value={blockedPaths} /></label>
            <label><span><input checked={requiresApproval} onChange={(event) => setRequiresApproval(event.target.checked)} type="checkbox" /> Require approval</span></label>
            <div><Button variant="primary" type="submit">Add rule</Button></div>
          </form>
        </div>
      </section>
      <SiteGuardIntegrationPanel
        site={site}
        hasKeys={hasKeys}
        rawKey={newKeyData?.rawKey}
      />
    </>
  );
}

function SiteGuardIntegrationPanel({ site, hasKeys, rawKey }: {
  site: Site;
  hasKeys: boolean;
  rawKey?: string;
}) {
  const envSnippet = buildSiteGuardEnvSnippet(rawKey);
  const curlSnippet = buildSiteGuardCurlSnippet();
  const nextjsSnippet = buildSiteGuardNextjsSnippet();
  const expressSnippet = buildSiteGuardExpressSnippet();

  return (
    <section className="dashboard-panel">
      <div className="dashboard-section-header">
        <div>
          <p className="section-kicker">{site.name} · {site.domain}</p>
          <h2>Use this site</h2>
          <p>Use a site key server-side before serving protected routes.</p>
        </div>
        <ButtonLink href="/docs/site-guard">Docs</ButtonLink>
      </div>

      <div className="review-notice review-notice--warning">
        <strong>Never expose <code>SITE_GUARD_KEY</code> in browser or client code.</strong>
        {" "}Site keys are server-side only. Do not include them in client bundles, environment
        variables visible to the browser, or any response sent to end users or crawlers.
      </div>

      {!hasKeys ? (
        <div className="review-notice">
          <strong>Create a site key to use these snippets.</strong>
          <p className="field-help">
            Create a key using the form above. Copy it immediately after creation — it will not
            be shown again. Store it as <code>SITE_GUARD_KEY</code> in your server environment or
            secret manager.
          </p>
        </div>
      ) : null}

      <h3>1. Add to your environment</h3>
      <p className="field-help">
        {rawKey
          ? "Your new key is shown below. Copy it now — it will not be shown again after you dismiss the banner above."
          : "Create a site key above, copy it immediately, then add it to your server environment."}
      </p>
      <CodeBlock label=".env">{envSnippet}</CodeBlock>

      <h3>2. Test with curl</h3>
      <p className="field-help">
        Confirm the key works from a terminal before adding it to your middleware.
        Set <code>SITE_GUARD_KEY</code> in your shell, then run:
      </p>
      <CodeBlock label="terminal">{curlSnippet}</CodeBlock>

      <h3>3a. Next.js middleware</h3>
      <p className="field-help">
        Place <code>middleware.ts</code> at the project root (same level as <code>app/</code>).
        It runs server-side before any route handler.{" "}
        See <code>examples/site-guard-nextjs/</code> for the full example with a reusable helper.
      </p>
      <CodeBlock label="middleware.ts">{nextjsSnippet}</CodeBlock>

      <h3>3b. Express middleware</h3>
      <p className="field-help">
        Wrap your routes with <code>siteGuard()</code> before the handler.{" "}
        See <code>examples/site-guard-express/</code> for the full example.
      </p>
      <CodeBlock label="src/siteGuard.ts">{expressSnippet}</CodeBlock>

      <p className="field-help" style={{ marginTop: 16 }}>
        <Link href="/docs/site-guard">Site Guard docs</Link>
        {" · "}
        Full examples: <code>examples/site-guard-nextjs</code>, <code>examples/site-guard-express</code>
      </p>
    </section>
  );
}

function OnboardingView() {
  const { apiJson: api } = useDashboardApi();
  const { apiPath, href: dHref } = useDashboardPaths();
  // Shared developer path state
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState("");
  const [passportUrl, setPassportUrl] = useState("");
  const [agent, setAgent] = useState<Agent | null>(null);
  const [permissionId, setPermissionId] = useState("");
  const [decision, setDecision] = useState<VerifyResult | null>(null);
  const [onboardingError, setOnboardingError] = useState("");
  const [onboardingScopeId, setOnboardingScopeId] = useState("");
  const [onboardingPolicyTemplateId, setOnboardingPolicyTemplateId] = useState("");
  const [onboardingPolicyApplying, setOnboardingPolicyApplying] = useState(false);
  const [agentForm, setAgentForm] = useState({
    name: "",
    provider: "" as ProviderSelection,
    externalAgentLabel: "",
    description: ""
  });
  const [permissionForm, setPermissionForm] = useState({
    template: "" as PermissionTemplate | "",
    actionChoice: "",
    customAction: "",
    resource: "",
    scope: "",
    allowedActions: "",
    blockedActions: "",
    requiresApproval: "yes",
    maxAmount: "",
    expiration: "",
    notes: ""
  });
  const [testForm, setTestForm] = useState({ action: "", resource: "", amount: "", context: "" });

  // Path selection
  const [userPath, setUserPath] = useState<OnboardingUserPath>(null);

  // Regular user path state
  const [regularStep, setRegularStep] = useState(1);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [regularProvider, setRegularProvider] = useState<AgentProvider | "">("");
  const [regularDescription, setRegularDescription] = useState("");
  const [draftResponse, setDraftResponse] = useState<PermissionDraftResponse | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [draftDetails, setDraftDetails] = useState("");
  const [draftErrorCode, setDraftErrorCode] = useState("");
  const [regularAgent, setRegularAgent] = useState<Agent | null>(null);
  const [regularPassportUrl, setRegularPassportUrl] = useState("");
  // Preset flow: holds the chosen preset while the user picks a provider for it
  const [pendingPreset, setPendingPreset] = useState<PassportPreset | null>(null);
  const [pendingPresetProvider, setPendingPresetProvider] = useState<AgentProvider | "">("");
  // True when the current draft was generated from a preset (so "back" on review goes to step 1 not step 2)
  const [arrivedViaPreset, setArrivedViaPreset] = useState(false);

  const selectedAction = permissionForm.template === "custom" ? permissionForm.customAction : permissionForm.actionChoice;

  const useExampleValues = () => {
    setOnboardingError("");
    setAgentForm({
      name: "Ollie",
      provider: "ollie",
      externalAgentLabel: "",
      description: "Personal assistant used for planning"
    });
    setPermissionForm({
      template: "purchase",
      actionChoice: "purchase",
      customAction: "",
      resource: "coachella.com",
      scope: "",
      allowedActions: "purchase tickets",
      blockedActions: "purchase from other vendors, exceed amount limit",
      requiresApproval: "yes",
      maxAmount: "800",
      expiration: "2",
      notes: ""
    });
  };

  const resetPermissionForm = () => {
    setPermissionForm({
      template: "",
      actionChoice: "",
      customAction: "",
      resource: "",
      scope: "",
      allowedActions: "",
      blockedActions: "",
      requiresApproval: "yes",
      maxAmount: "",
      expiration: "",
      notes: ""
    });
  };

  const applyOnboardingScopeTemplate = (scopeId: string) => {
    setOnboardingScopeId(scopeId);
    if (!scopeId) { resetPermissionForm(); return; }
    const scope = SCOPE_TEMPLATES.find((t) => t.id === scopeId);
    if (!scope || scope.id === "custom") { resetPermissionForm(); return; }
    const template = actionToPermTemplate(scope.defaultAction);
    setPermissionForm({
      template,
      actionChoice: scope.defaultAction,
      customAction: "",
      resource: scope.exampleResource,
      scope: "",
      allowedActions: scope.defaultAllowedActions.join(", "),
      blockedActions: scope.defaultBlockedActions.join(", "),
      requiresApproval: scope.requiresApprovalDefault ? "yes" : "no",
      maxAmount: "",
      expiration: "",
      notes: ""
    });
  };

  const applyOnboardingPolicyTemplate = (pt: PolicyTemplate) => {
    setOnboardingPolicyTemplateId(pt.id);
    if (pt.permissions.length === 1) {
      const p = pt.permissions[0];
      const template = actionToPermTemplate(p.action);
      setPermissionForm({
        template,
        actionChoice: p.action,
        customAction: "",
        resource: p.resource,
        scope: "",
        allowedActions: p.allowedActions.join(", "),
        blockedActions: p.blockedActions.join(", "),
        requiresApproval: p.requiresApproval ? "yes" : "no",
        maxAmount: p.constraints?.maxAmount != null ? String(p.constraints.maxAmount) : "",
        expiration: "",
        notes: p.notes ?? ""
      });
    }
  };

  const applyOnboardingPolicyTemplateAll = async (pt: PolicyTemplate) => {
    if (!agent || pt.permissions.length <= 1) return;
    setOnboardingPolicyApplying(true);
    try {
      let lastPermissionId = "";
      for (const p of pt.permissions) {
        const tmpl = actionToPermTemplate(p.action);
        const result = await api<{ permissionId: string }>(`/api/dashboard/agents/${agent.agentId}/permissions`, {
          method: "POST",
          body: JSON.stringify({
            action: p.action,
            resource: p.resource || undefined,
            allowedActions: p.allowedActions,
            blockedActions: p.blockedActions,
            requiresApproval: p.requiresApproval,
            template: tmpl || undefined,
            notes: p.notes || undefined,
            constraints: {
              maxAmount: p.constraints?.maxAmount,
              allowedVendors: p.constraints?.allowedVendors
            }
          })
        });
        lastPermissionId = result.permissionId;
      }
      setPermissionId(lastPermissionId);
      setTestForm({ action: pt.permissions[0].action, resource: pt.permissions[0].resource, amount: "", context: "" });
      setStep(4);
    } finally {
      setOnboardingPolicyApplying(false);
    }
  };

  const chooseTemplate = (template: PermissionTemplate) => {
    const defaults: Record<PermissionTemplate, Partial<typeof permissionForm>> = {
      access_data: { actionChoice: "access_data" },
      create_content: { actionChoice: "create_content", requiresApproval: "yes" },
      schedule: { actionChoice: "schedule" },
      purchase: { actionChoice: "purchase" },
      custom: { actionChoice: "custom" }
    };
    setOnboardingError("");
    setPermissionForm({
      template,
      actionChoice: "",
      customAction: "",
      resource: "",
      scope: "",
      allowedActions: "",
      blockedActions: "",
      requiresApproval: "yes",
      maxAmount: "",
      expiration: "",
      notes: "",
      ...defaults[template]
    });
  };

  const createAgent = async (event: FormEvent) => {
    event.preventDefault();
    setOnboardingError("");
    if (!agentForm.name.trim()) {
      setOnboardingError("Agent name is required.");
      return;
    }
    const result = await api<{ agent: Agent; apiKey: string }>("/api/dashboard/agents", {
      method: "POST",
      body: JSON.stringify({
        name: agentForm.name,
        agentType: "native",
        provider: "custom",
        description: agentForm.description || undefined
      })
    });
    setAgent(result.agent);
    setApiKey(result.apiKey);
    const passport = await api<{ passportUrl: string }>(`/api/dashboard/agents/${result.agent.agentId}/passport`, { method: "POST" });
    setPassportUrl(passport.passportUrl);
    setStep(3);
  };

  const createPermission = async (event: FormEvent) => {
    event.preventDefault();
    if (!agent) return;
    setOnboardingError("");
    if (!selectedAction.trim()) {
      setOnboardingError("Action is required for permissions.");
      return;
    }
    const result = await api<{ permissionId: string }>(`/api/dashboard/agents/${agent.agentId}/permissions`, {
      method: "POST",
      body: JSON.stringify({
        action: selectedAction,
        resource: permissionForm.resource || undefined,
        scope: permissionForm.scope || undefined,
        allowedActions: permissionForm.allowedActions
          ? permissionForm.allowedActions.split(",").map((item) => item.trim()).filter(Boolean)
          : undefined,
        blockedActions: permissionForm.blockedActions
          ? permissionForm.blockedActions.split(",").map((item) => item.trim()).filter(Boolean)
          : undefined,
        requiresApproval: permissionForm.requiresApproval === "yes" ? true : permissionForm.requiresApproval === "no" ? false : undefined,
        notes: permissionForm.notes || undefined,
        template: permissionForm.template || undefined,
        constraints: {
          maxAmount: permissionForm.maxAmount ? Number(permissionForm.maxAmount) : undefined,
          allowedVendors: permissionForm.resource ? [permissionForm.resource] : undefined,
          expiresAt: permissionForm.expiration
            ? new Date(Date.now() + Number(permissionForm.expiration) * 60 * 60 * 1000).toISOString()
            : undefined
        }
      })
    });
    setPermissionId(result.permissionId);
    setTestForm({ action: selectedAction, resource: permissionForm.resource, amount: permissionForm.maxAmount || "", context: "" });
    setStep(4);
  };

  const testAction = async (event: FormEvent) => {
    event.preventDefault();
    if (!agent) return;
    setDecision(await api<VerifyResult>("/api/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        agentId: agent.agentId,
        action: testForm.action,
        resource: testForm.resource || undefined,
        amount: testForm.amount ? Number(testForm.amount) : undefined,
        metadata: testForm.context ? { context: testForm.context } : undefined
      })
    }));
    setStep(5);
  };

  const applyPreset = (preset: PassportPreset) => {
    setDraftError("");
    setDraftDetails("");
    setDraftErrorCode("");
    // Store the preset and ask the user to choose a provider before generating the draft
    setPendingPreset(preset);
    // Pre-select the preset's default provider but let the user change it
    setPendingPresetProvider(preset.provider);
    setRegularStep(2);
  };

  const confirmPresetWithProvider = () => {
    if (!pendingPreset) return;
    if (!pendingPresetProvider) { setDraftError("Select a provider to continue."); return; }
    setDraftError("");
    const provider = pendingPresetProvider;
    const permissions = buildPresetPermissions(pendingPreset);
    setRegularProvider(provider);
    setRegularDescription(pendingPreset.agentDescription);
    setDraftResponse({
      agentDraft: { provider, description: pendingPreset.agentDescription },
      permissions,
      needsClarification: [],
      warnings: [],
      limitations: [
        "This passport was generated from a preset. Review and adjust the permissions to fit your specific needs."
      ]
    });
    setPendingPreset(null);
    setArrivedViaPreset(true);
    setRegularStep(3);
  };

  const generateDraft = async () => {
    if (!regularProvider) { setDraftError("Select a provider first."); return; }
    if (!regularDescription.trim() || regularDescription.trim().length < 5) { setDraftError("Describe what you want the assistant to do."); return; }
    setDraftError("");
    setDraftDetails("");
    setDraftErrorCode("");
    setDraftLoading(true);
    try {
      const res = await fetch(apiPath("/api/dashboard/onboarding/draft-permissions"), {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ provider: regularProvider, description: regularDescription.trim() })
      });
      const body = await res.json().catch(() => null) as { error?: string; details?: string; code?: string } & Partial<PermissionDraftResponse> | null;
      if (!res.ok) {
        setDraftError(body?.error ?? `Request failed (${res.status})`);
        setDraftDetails(body?.details ?? "");
        setDraftErrorCode(body?.code ?? "");
        return;
      }
      setDraftResponse(body as PermissionDraftResponse);
      setArrivedViaPreset(false);
      setRegularStep(3);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Failed to reach the server.");
      setDraftDetails("");
      setDraftErrorCode("");
    } finally {
      setDraftLoading(false);
    }
  };

  const confirmDraft = async () => {
    const permissions = draftResponse?.permissions;
    if (!permissions?.length) return;
    setDraftError("");
    setDraftLoading(true);
    const providerLabel = regularProviderOptions.find((p) => p.value === regularProvider)?.label ?? regularProvider;
    const agentDescription = draftResponse?.agentDraft.description || regularDescription.trim() || undefined;
    try {
      const result = await api<{ agent: Agent; apiKey: string }>("/api/dashboard/agents", {
        method: "POST",
        body: JSON.stringify({
          name: `My ${providerLabel} agent`,
          agentType: "connected",
          provider: regularProvider || "other",
          description: agentDescription
        })
      });
      const newAgent = result.agent;
      setRegularAgent(newAgent);
      const passport = await api<{ passportUrl: string }>(`/api/dashboard/agents/${newAgent.agentId}/passport`, { method: "POST" });
      setRegularPassportUrl(passport.passportUrl);
      for (const perm of permissions) {
        await api(`/api/dashboard/agents/${newAgent.agentId}/permissions`, {
          method: "POST",
          body: JSON.stringify({
            action: perm.action,
            resource: perm.resource || undefined,
            allowedActions: perm.allowedActions.length ? perm.allowedActions : undefined,
            blockedActions: perm.blockedActions.length ? perm.blockedActions : undefined,
            requiresApproval: perm.requiresApproval,
            constraints: perm.constraints ? {
              maxAmount: perm.constraints.maxAmount ?? undefined,
              allowedVendors: perm.constraints.allowedVendors?.length ? perm.constraints.allowedVendors : undefined,
              expiresAt: perm.constraints.expiresAt ?? undefined
            } : undefined
          })
        });
      }
      setRegularStep(4);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Something went wrong creating the passport.");
    } finally {
      setDraftLoading(false);
    }
  };

  const instructions = `You are connected to my BehalfID permission passport.

Open the passport link and read the Allowed scopes section or Machine-readable passport section before deciding what you are allowed to do.

Before taking an external action, compare the requested action against the allowed scopes in this passport. If the action is not listed, exceeds a limit, is expired, or conflicts with a blocked action, ask me to verify it first.

If BehalfID denies the action, do not proceed.

Permission passport:
${passportUrl || "[passport link]"}`;

  const regularInstructions = `You are connected to my BehalfID permission passport.

Open the passport link and read the Allowed scopes section or Machine-readable passport section before deciding what you are allowed to do.

Before taking an external action, compare the requested action against the allowed scopes in this passport. If the action is not listed, exceeds a limit, is expired, or conflicts with a blocked action, ask me to verify it first.

If BehalfID denies the action, do not proceed.

Permission passport:
${regularPassportUrl || "[passport link]"}`;

  // --- Initial path choice ---
  if (userPath === null) {
    return (
      <>
        <Header title="Add agent" description="Choose how you want to integrate BehalfID — as a developer or as an existing AI assistant user." />
        <section className="agent-create-grid ob-step--enter">
          <button
            className="dashboard-panel onboarding-choice"
            onClick={() => {
              setUserPath("developer");
              setAgentForm({ name: "", provider: "custom", externalAgentLabel: "", description: "" });
              resetPermissionForm();
              setStep(2);
            }}
            type="button"
          >
            <span className="console-status">Developer mode</span>
            <h2>I&apos;m a developer building with agents</h2>
            <p>Use the API, SDK, webhooks, and verification endpoint to enforce permissions before your agent acts.</p>
            <small>Create an agent → define scopes → call verify() → fail closed.</small>
          </button>
          <button
            className="dashboard-panel onboarding-choice"
            onClick={() => {
              setUserPath("regular");
              setRegularStep(1);
              setActivePresetId(null);
              setRegularProvider("");
              setRegularDescription("");
              setDraftResponse(null);
              setDraftError("");
              setPendingPreset(null);
              setPendingPresetProvider("");
              setArrivedViaPreset(false);
            }}
            type="button"
          >
            <span className="console-status console-status--active">Passport mode</span>
            <h2>I&apos;m using an existing AI assistant</h2>
            <p>Create a manual permission passport for ChatGPT, Claude, Gemini, Ollie, Zapier, Make, or another assistant.</p>
            <small>Describe what you want → AI drafts permissions → you review and confirm.</small>
          </button>
        </section>
      </>
    );
  }

  // --- Regular user path ---
  if (userPath === "regular") {
    return (
      <>
        <Header title="Create a permission passport" action={<Button onClick={() => { setUserPath(null); setRegularStep(1); setPendingPreset(null); setPendingPresetProvider(""); setArrivedViaPreset(false); }} type="button">Back</Button>} />
        <Card className="dashboard-panel onboarding-callout">
          <p className="section-kicker">Choose provider / describe what you want / review draft / confirm</p>
          <h2>Describe what you want the assistant to do. AI will draft the permissions. You review and confirm.</h2>
        </Card>
        {/* Step indicator: hide on preset provider-picker step to avoid a broken/skipped Step 2 pill */}
        {!pendingPreset ? (
          <div className="onboarding-steps">
            {[1, 2, 3, 4].map((item) => (
              <span className={item === regularStep ? "console-status console-status--active" : "console-status"} key={item}>Step {item}</span>
            ))}
          </div>
        ) : null}

        <div key={`regular-${regularStep}-${pendingPreset?.id ?? ""}`} className="ob-step--enter">
        {regularStep === 1 ? (
          <section className="onboarding-form dashboard-panel">
            <h2>Start from a preset or choose a provider</h2>

            <p className="section-kicker">Preset passports</p>
            <p>Pick a common use case — your passport permissions will be ready to review instantly, no description needed.</p>
            <div className="agent-create-grid">
              {PASSPORT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={`dashboard-panel onboarding-choice${activePresetId === preset.id ? " onboarding-choice--selected" : ""}`}
                  type="button"
                  onClick={() => {
                    setActivePresetId(preset.id);
                    setTimeout(() => { applyPreset(preset); setActivePresetId(null); }, 120);
                  }}
                >
                  <strong>{preset.label}</strong>
                  <span>{preset.tagline}</span>
                </button>
              ))}
            </div>

            <p className="section-kicker" style={{ marginTop: 24 }}>Or choose a provider</p>
            <p>Pick your AI assistant and describe what you want it to do. AI will draft the permissions.</p>
            <div className="agent-create-grid">
              {regularProviderOptions.map((opt) => (
                <button
                  key={opt.value}
                  className={regularProvider === opt.value ? "dashboard-panel onboarding-choice onboarding-choice--selected" : "dashboard-panel onboarding-choice"}
                  onClick={() => setRegularProvider(opt.value)}
                  type="button"
                >
                  <strong>{opt.label}</strong>
                  <span>{opt.description}</span>
                </button>
              ))}
            </div>
            {draftError ? <p className="form-error" role="alert">{draftError}</p> : null}
            <Button
              variant="primary"
              type="button"
              onClick={() => {
                if (!regularProvider) { setDraftError("Select a provider to continue."); return; }
                setDraftError("");
                setRegularStep(2);
              }}
            >
              Continue
            </Button>
          </section>
        ) : null}

        {regularStep === 2 && pendingPreset ? (
          <section className="onboarding-form dashboard-panel">
            <h2>Which assistant are you using?</h2>
            <p>You chose the <strong>{pendingPreset.label}</strong> preset. Pick the assistant you want to create this passport for — the agent will be named accordingly.</p>
            <div className="agent-create-grid">
              {regularProviderOptions.map((opt) => (
                <button
                  key={opt.value}
                  className={pendingPresetProvider === opt.value ? "dashboard-panel onboarding-choice onboarding-choice--selected" : "dashboard-panel onboarding-choice"}
                  onClick={() => { setDraftError(""); setPendingPresetProvider(opt.value); }}
                  type="button"
                >
                  <strong>{opt.label}</strong>
                  <span>{opt.description}</span>
                </button>
              ))}
            </div>
            {draftError ? <p className="form-error" role="alert">{draftError}</p> : null}
            <div className="form-actions">
              <Button type="button" onClick={() => { setDraftError(""); setPendingPreset(null); setPendingPresetProvider(""); setRegularStep(1); }}>Back</Button>
              <Button variant="primary" type="button" onClick={confirmPresetWithProvider}>Continue to review</Button>
            </div>
          </section>
        ) : null}

        {regularStep === 2 && !pendingPreset ? (
          <section className="dashboard-panel onboarding-form">
            <h2>What do you want this assistant to do?</h2>
            <p>Include what it <strong>can</strong> do, what it <strong>must not</strong> do, and any limits (e.g. dollar amounts, specific services). The more specific you are, the better the draft.</p>
            <label>
              <textarea
                placeholder="e.g. Read and summarize my emails, but do not send, delete, forward, or change filters."
                rows={5}
                maxLength={2000}
                value={regularDescription}
                onChange={(e) => setRegularDescription(e.target.value)}
              />
            </label>
            <p className="field-help" style={{ textAlign: "right", marginTop: 2 }}>{regularDescription.length} / 2000</p>
            <p className="section-kicker">Examples — click to use</p>
            <div className="permission-template-grid permission-template-grid--nested">
              {DESCRIPTION_EXAMPLES.map((example) => (
                <button
                  key={example}
                  className="permission-template"
                  type="button"
                  onClick={() => setRegularDescription(example)}
                >
                  {example}
                </button>
              ))}
            </div>
            {draftError ? (
              <div>
                <p className="form-error" role="alert">{draftError}</p>
                {draftDetails ? <p className="field-help">{draftDetails}</p> : null}
                {draftErrorCode === "LOCALHOST_IN_PRODUCTION" ? (
                  <p className="field-help">Production cannot use localhost for Ollama. Test this flow locally with <code>npm run dev</code>, or configure a secure Ollama proxy.</p>
                ) : null}
                {draftErrorCode === "NOT_CONFIGURED" ? (
                  <p className="field-help">Run <code>npm run check:ollama</code> locally to verify your Ollama setup, then add the env vars to .env.</p>
                ) : null}
                {draftErrorCode === "MODEL_NOT_FOUND" ? (
                  <p className="field-help">Run <code>npm run check:ollama</code> to see which models are installed.</p>
                ) : null}
                {draftErrorCode === "TIMEOUT" ? (
                  <p className="field-help">Ollama took too long. Increase <code>OLLAMA_TIMEOUT_MS</code> in .env, then restart both the dev server (<code>npm run dev</code>) and the secure proxy (<code>npm run ollama:proxy</code>) so they both pick up the new value.</p>
                ) : null}
                {draftErrorCode === "UNREACHABLE" ? (
                  <p className="field-help">Could not connect to Ollama. Make sure Ollama is running (<code>ollama serve</code>) and restart the dev server after editing .env. If your description matches a known pattern, BehalfID will generate a rule-based draft automatically.</p>
                ) : null}
              </div>
            ) : null}
            <div className="form-actions">
              <Button type="button" onClick={() => { setDraftError(""); setDraftDetails(""); setDraftErrorCode(""); setRegularStep(1); }}>Back</Button>
              <Button variant="primary" type="button" onClick={generateDraft} disabled={draftLoading}>
                {draftLoading ? "Generating draft…" : "Generate draft passport"}
              </Button>
            </div>
          </section>
        ) : null}

        {regularStep === 3 && draftResponse ? (
          <section className="dashboard-panel onboarding-form">
            <div className="agent-passport__header">
              <span className="console-status">Draft — not active yet</span>
            </div>
            <h2>Review your draft passport</h2>
            <p>BehalfID drafted these permissions based on your description. Review them carefully. <strong>Nothing has been created yet.</strong></p>
            <p className="field-help">Permissions are inactive until you confirm. You can add, edit, or revoke permissions later from the agent detail page.</p>

            {draftResponse.needsClarification.length > 0 ? (
              <div className="dashboard-panel review-notice review-notice--clarify">
                <strong>This draft needs clarification before it can be created:</strong>
                <ul className="review-list">
                  {draftResponse.needsClarification.map((item, i) => (
                    <li key={i}>{item.question}<small>{item.reason}</small></li>
                  ))}
                </ul>
              </div>
            ) : null}

            {draftResponse.warnings.length > 0 ? (
              <div className="dashboard-panel review-notice review-notice--warning">
                <strong>Heads up:</strong>
                <ul className="review-list">
                  {draftResponse.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            ) : null}

            {draftResponse.permissions.map((perm, index) => (
              <div key={index} className="dashboard-panel review-permission">
                <div className="agent-passport__header">
                  <span className="console-status">Draft permission {index + 1}</span>
                  <code>{perm.action}</code>
                  <Badge>{perm.riskLevel} risk</Badge>
                  {perm.requiresApproval ? <span className="console-status console-status--active">Requires your approval</span> : null}
                </div>
                {perm.reason ? <p className="field-help">{perm.reason}</p> : null}
                {perm.resource ? <p><strong>Resource:</strong> {perm.resource}</p> : null}
                {perm.constraints?.maxAmount ? <p><strong>Spending limit:</strong> ${perm.constraints.maxAmount}</p> : null}
                {perm.constraints?.allowedVendors?.length ? (
                  <p><strong>Allowed vendors:</strong> {perm.constraints.allowedVendors.join(", ")}</p>
                ) : null}
                {perm.allowedActions.length ? (
                  <div>
                    <strong>Allowed:</strong>
                    <ul className="review-list review-list--compact">
                      {perm.allowedActions.map((a) => <li key={a}>{a}</li>)}
                    </ul>
                  </div>
                ) : null}
                {perm.blockedActions.length ? (
                  <div>
                    <strong>Blocked:</strong>
                    <ul className="review-list review-list--compact">
                      {perm.blockedActions.map((a) => <li key={a}>{a}</li>)}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}

            {draftResponse.limitations.length > 0 ? (
              <div className="field-help review-limitations">
                <strong>Limitations of this draft:</strong>
                <ul className="review-list review-list--compact">
                  {draftResponse.limitations.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              </div>
            ) : null}

            {draftError ? (
              <div>
                <p className="form-error" role="alert">{draftError}</p>
                {draftDetails ? <p className="field-help">{draftDetails}</p> : null}
              </div>
            ) : null}
            <div className="form-actions">
              <Button type="button" onClick={() => { setDraftError(""); setDraftDetails(""); setDraftErrorCode(""); setRegularStep(arrivedViaPreset ? 1 : 2); setArrivedViaPreset(false); }}>{arrivedViaPreset ? "Back to presets" : "Edit description"}</Button>
              {draftResponse.needsClarification.length > 0 ? (
                <Button type="button" disabled>
                  Clarify before creating passport
                </Button>
              ) : (
                <Button variant="primary" type="button" onClick={confirmDraft} disabled={draftLoading}>
                  {draftLoading ? "Creating passport…" : "Confirm and create passport"}
                </Button>
              )}
            </div>
          </section>
        ) : null}

        {regularStep === 4 && regularAgent ? (
          <section className="onboarding-result-grid">
            <Card className="dashboard-panel">
              <h2>Passport created</h2>
              <p>Your permission passport is live. Copy the instructions below and paste them into your AI assistant.</p>
              <div className="agent-passport__header">
                <ButtonLink href={dHref(`/dashboard/agents/${regularAgent.agentId}`)}>Open agent</ButtonLink>
                {regularPassportUrl ? <ButtonLink href={regularPassportUrl}>Open passport</ButtonLink> : null}
              </div>
            </Card>
            <Card className="dashboard-panel">
              <h2>Paste into your assistant</h2>
              <p>Copy this block into your AI assistant&apos;s system prompt, memory, or instructions. The assistant will read the passport link and ask you to verify actions it is not explicitly allowed to take.</p>
              <p className="field-help">Some assistants cannot fetch passport links directly (for example, Gemini memory or ChatGPT system prompts). If the assistant cannot read the link, open the passport page and paste the Agent memory block instead.</p>
              <CodeBlock label="copy into your assistant">{regularInstructions}</CodeBlock>
            </Card>
          </section>
        ) : null}
        </div>
      </>
    );
  }

  // --- Developer path ---
  return (
    <>
      <Header title="Add agent" action={step === 2 ? <Button onClick={() => { setUserPath(null); setStep(1); }} type="button">Back</Button> : null} />
      <Card className="dashboard-panel onboarding-callout">
        <p className="section-kicker">Create agent / define scopes / call verify() / use SDK or webhooks / fail closed</p>
        <h2>Create a native BehalfID agent with an API key for SDK/API enforcement.</h2>
      </Card>
      <div className="onboarding-steps">
        {[2, 3, 4, 5].map((item) => <span className={item === step ? "console-status console-status--active" : "console-status"} key={item}>Step {item - 1}</span>)}
      </div>
      <div key={step} className="ob-step--enter">
      {step === 2 ? (
        <form className="dashboard-panel onboarding-form" noValidate onSubmit={createAgent}>
          <h2>Agent setup</h2>
          <p>This creates a native BehalfID agent with an API key for SDK/API enforcement.</p>
          <label><span>Agent name</span><input placeholder="e.g. Checkout agent, Support workflow agent" value={agentForm.name} onChange={(event) => setAgentForm({ ...agentForm, name: event.target.value })} required /></label>
          <label><span>Description</span><textarea placeholder="Optional: what this agent is used for" rows={3} value={agentForm.description} onChange={(event) => setAgentForm({ ...agentForm, description: event.target.value })} /></label>
          {onboardingError ? <p className="form-error" role="alert">{onboardingError}</p> : null}
          <Button variant="primary" type="submit">Create agent</Button>
        </form>
      ) : null}
      {step === 3 ? (
        <form className="dashboard-panel onboarding-form" noValidate onSubmit={createPermission}>
          <h2>Create first permission</h2>
          <p>Choose a policy template for real developer workflows, or use a scope template to pre-fill the form, or define a custom action from scratch.</p>
          <Button onClick={useExampleValues} type="button">Use example values</Button>
          <div className="policy-template-section">
            <span className="field-label">Policy templates</span>
            <p className="field-help">Opinionated policies for coding agents and developer tools. Single-permission templates pre-fill the form. Multi-permission templates are applied immediately.</p>
            <div className="permission-template-grid">
              {POLICY_TEMPLATES.map((pt) => (
                <button
                  key={pt.id}
                  type="button"
                  className={onboardingPolicyTemplateId === pt.id ? "permission-template permission-template--active" : "permission-template"}
                  onClick={() => {
                    if (pt.permissions.length === 1) {
                      applyOnboardingPolicyTemplate(pt);
                    } else {
                      setOnboardingPolicyTemplateId(onboardingPolicyTemplateId === pt.id ? "" : pt.id);
                    }
                  }}
                >
                  <strong>{pt.label}</strong>
                  <span>{pt.tagline}</span>
                  <small>{POLICY_CATEGORY_LABELS[pt.category]} · {pt.permissions.length === 1 ? "1 permission" : `${pt.permissions.length} permissions`}</small>
                </button>
              ))}
            </div>
            {onboardingPolicyTemplateId && (() => {
              const pt = POLICY_TEMPLATES.find((t) => t.id === onboardingPolicyTemplateId);
              if (!pt || pt.permissions.length <= 1) return null;
              return (
                <div className="policy-template-multi-preview" style={{ marginTop: 12, padding: "12px 16px", background: "var(--surface-2)", borderRadius: 8 }}>
                  <strong>Permissions that will be created:</strong>
                  <ul style={{ margin: "8px 0", paddingLeft: 18 }}>
                    {pt.permissions.map((p, i) => (
                      <li key={i}>
                        <strong>{p.action}</strong> on <code>{p.resource}</code>{p.requiresApproval ? " — requires approval" : " — auto-allowed"}
                      </li>
                    ))}
                  </ul>
                  <p className="field-help">Blocks: {pt.blocks.join(", ")}.</p>
                  <div className="form-actions">
                    <Button type="button" variant="primary" onClick={() => applyOnboardingPolicyTemplateAll(pt)} disabled={onboardingPolicyApplying}>
                      {onboardingPolicyApplying ? "Applying…" : `Apply ${pt.permissions.length} permissions`}
                    </Button>
                    <Button type="button" onClick={() => setOnboardingPolicyTemplateId("")}>Cancel</Button>
                  </div>
                </div>
              );
            })()}
          </div>
          <label>
            <span>Scope template</span>
            <select value={onboardingScopeId} onChange={(e) => applyOnboardingScopeTemplate(e.target.value)}>
              <option value="">Select a scope template (optional)</option>
              {SCOPE_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <small className="field-help">Scopes are reusable permission patterns. You can edit the allowed and blocked actions before saving.</small>
          </label>
          <div className="permission-template-grid">
            {permissionTemplates.map((template) => (
              <button
                className={permissionForm.template === template.value ? "permission-template permission-template--active" : "permission-template"}
                key={template.value}
                onClick={() => chooseTemplate(template.value)}
                type="button"
              >
                <strong>{template.title}</strong>
                <span>{template.body}</span>
              </button>
            ))}
          </div>
          {permissionForm.template === "access_data" ? (
            <>
              <label><span>Service / resource</span><input placeholder="gmail.com, notion, google-drive, crm" value={permissionForm.resource} onChange={(event) => setPermissionForm({ ...permissionForm, resource: event.target.value })} /></label>
              <label><span>Allowed actions</span><input placeholder="read labels, summarize docs, view tickets, provide pricing metrics" value={permissionForm.allowedActions} onChange={(event) => setPermissionForm({ ...permissionForm, allowedActions: event.target.value })} /><small className="field-help">Comma-separated list of what this agent may do.</small></label>
              <label><span>Blocked actions</span><input placeholder="send email, delete files, make purchases, place orders" value={permissionForm.blockedActions} onChange={(event) => setPermissionForm({ ...permissionForm, blockedActions: event.target.value })} /><small className="field-help">Comma-separated list of what this agent must never do.</small></label>
              <label><span>Requires approval?</span><select value={permissionForm.requiresApproval} onChange={(event) => setPermissionForm({ ...permissionForm, requiresApproval: event.target.value })}><option value="yes">Yes</option><option value="no">No</option></select></label>
            </>
          ) : null}
          {permissionForm.template === "create_content" ? (
            <>
              <label><span>Service / channel</span><input placeholder="gmail.com, slack, hubspot" value={permissionForm.resource} onChange={(event) => setPermissionForm({ ...permissionForm, resource: event.target.value })} /></label>
              <label><span>Allowed actions</span><input placeholder="draft replies, create notes, write ticket summaries" value={permissionForm.allowedActions} onChange={(event) => setPermissionForm({ ...permissionForm, allowedActions: event.target.value })} /><small className="field-help">Comma-separated list of what this agent may create or send.</small></label>
              <label><span>Blocked actions</span><input placeholder="send without review, delete messages, modify contacts" value={permissionForm.blockedActions} onChange={(event) => setPermissionForm({ ...permissionForm, blockedActions: event.target.value })} /></label>
              <label><span>Requires approval?</span><select value={permissionForm.requiresApproval} onChange={(event) => setPermissionForm({ ...permissionForm, requiresApproval: event.target.value })}><option value="yes">Yes</option><option value="no">No</option></select></label>
            </>
          ) : null}
          {permissionForm.template === "schedule" ? (
            <>
              <label><span>Calendar / workflow</span><input placeholder="google-calendar, family schedule, sales calendar" value={permissionForm.resource} onChange={(event) => setPermissionForm({ ...permissionForm, resource: event.target.value })} /></label>
              <label><span>Allowed actions</span><input placeholder="suggest times, create draft event, book meeting" value={permissionForm.allowedActions} onChange={(event) => setPermissionForm({ ...permissionForm, allowedActions: event.target.value })} /><small className="field-help">Comma-separated list of what this agent may schedule.</small></label>
              <label><span>Blocked actions</span><input placeholder="delete events, invite external contacts, modify recurring events" value={permissionForm.blockedActions} onChange={(event) => setPermissionForm({ ...permissionForm, blockedActions: event.target.value })} /></label>
              <label><span>Time limit / expiration</span><select value={permissionForm.expiration} onChange={(event) => setPermissionForm({ ...permissionForm, expiration: event.target.value })}><option value="">No expiration</option><option value="1">1 hour</option><option value="2">2 hours</option><option value="24">24 hours</option><option value="168">7 days</option></select></label>
            </>
          ) : null}
          {permissionForm.template === "purchase" ? (
            <>
              <label><span>Vendor / merchant</span><input placeholder="coachella.com, amazon.com" value={permissionForm.resource} onChange={(event) => setPermissionForm({ ...permissionForm, resource: event.target.value })} /></label>
              <label><span>Max amount</span><input min="0" placeholder="800" type="number" value={permissionForm.maxAmount} onChange={(event) => setPermissionForm({ ...permissionForm, maxAmount: event.target.value })} /></label>
              <label><span>Expiration</span><select value={permissionForm.expiration} onChange={(event) => setPermissionForm({ ...permissionForm, expiration: event.target.value })}><option value="">No expiration</option><option value="1">1 hour</option><option value="2">2 hours</option><option value="24">24 hours</option><option value="168">7 days</option></select></label>
            </>
          ) : null}
          {permissionForm.template === "custom" ? (
            <>
              <label><span>Action</span><input placeholder="analyze_statement, create_invoice, update_ticket" value={permissionForm.customAction} onChange={(event) => setPermissionForm({ ...permissionForm, customAction: event.target.value })} /></label>
              <label><span>Resource / service</span><input placeholder="quickbooks invoices, zendesk tickets, student progress" value={permissionForm.resource} onChange={(event) => setPermissionForm({ ...permissionForm, resource: event.target.value })} /></label>
              <label><span>Allowed actions</span><input placeholder="read records, summarize, generate report" value={permissionForm.allowedActions} onChange={(event) => setPermissionForm({ ...permissionForm, allowedActions: event.target.value })} /><small className="field-help">Comma-separated list of what this agent may do.</small></label>
              <label><span>Blocked actions</span><input placeholder="edit records, delete, export raw data" value={permissionForm.blockedActions} onChange={(event) => setPermissionForm({ ...permissionForm, blockedActions: event.target.value })} /></label>
              <label><span>Requires approval?</span><select value={permissionForm.requiresApproval} onChange={(event) => setPermissionForm({ ...permissionForm, requiresApproval: event.target.value })}><option value="yes">Yes</option><option value="no">No</option></select></label>
              <label><span>Notes</span><input placeholder="read-only, max 10 records, internal use only" value={permissionForm.notes} onChange={(event) => setPermissionForm({ ...permissionForm, notes: event.target.value })} /></label>
            </>
          ) : null}
          <p className="field-help">BehalfID enforces action, blocked actions, allowed actions, approval requirements, expiration, and simple resource/vendor/amount constraints. Your integration still needs to call verify before the tool runs.</p>
          {onboardingError ? <p className="form-error" role="alert">{onboardingError}</p> : null}
          <Button variant="primary" type="submit">Create permission</Button>
        </form>
      ) : null}
      {step === 4 ? (
        <section>
          <div className="onboarding-result-grid onboarding-result-grid--native" style={{ marginBottom: 18 }}>
            <Card className="dashboard-panel">
              <h2>Install the SDK</h2>
              <p>Install the BehalfID SDK in the app or executor that will call verify before tools run.</p>
              <CodeBlock label="terminal">npm install @behalfid/sdk</CodeBlock>
              <p className="field-help" style={{ marginTop: 16, marginBottom: 8 }}>If you also use the BehalfID CLI or MCP server, install the CLI and configure it with the same agent.</p>
              <CodeBlock label="terminal">{CLI_NPM_INSTALL_COMMAND}</CodeBlock>
              <CodeBlock label="copy and run">{`behalf config set api-key ${apiKey}\nbehalf config set agent-id ${agent?.agentId ?? ""}`}</CodeBlock>
              <p className="field-help" style={{ marginTop: 8 }}>Your API key was shown once after creating the agent. If you missed it, rotate it from the agent detail page.</p>
            </Card>
            <Card className="dashboard-panel">
              <h2>Connect your AI tool</h2>
              <p>After authenticating, launch your AI with BehalfID enforcement active.</p>
              <div className="sdk-connect-tools">
                <div className="sdk-connect-tool">
                  <strong>Claude Code</strong>
                  <CodeBlock label="terminal">behalf claude</CodeBlock>
                </div>
                <div className="sdk-connect-tool">
                  <strong>Codex CLI</strong>
                  <CodeBlock label="terminal">behalf codex</CodeBlock>
                </div>
                <div className="sdk-connect-tool">
                  <strong>Gemini / other tools</strong>
                  <CodeBlock label="terminal">behalf mcp init</CodeBlock>
                  <p className="field-help">Generates a <code>.mcp.json</code> and injects the BehalfID context into your agent config file. Open Gemini or your IDE with that config active.</p>
                </div>
              </div>
            </Card>
          </div>
          <form className="dashboard-panel onboarding-form" onSubmit={testAction}>
            <h2>Test a verification call</h2>
            <p>Preview how BehalfID will respond when your agent requests permission for an action. Permission created: <code>{permissionId}</code></p>
            <label><span>Action</span><input value={testForm.action} onChange={(event) => setTestForm({ ...testForm, action: event.target.value })} /></label>
            <label><span>Resource / service</span><input placeholder="gmail.com, slack, google-calendar, coachella.com" value={testForm.resource} onChange={(event) => setTestForm({ ...testForm, resource: event.target.value })} /></label>
            {permissionForm.template === "purchase" ? <label><span>Amount</span><input min="0" type="number" value={testForm.amount} onChange={(event) => setTestForm({ ...testForm, amount: event.target.value })} /></label> : null}
            <label><span>Context / notes</span><input placeholder="Optional context for the preview" value={testForm.context} onChange={(event) => setTestForm({ ...testForm, context: event.target.value })} /></label>
            <Button variant="primary" type="submit">Test verification</Button>
          </form>
        </section>
      ) : null}
      {step === 5 && agent ? (
        <section className="onboarding-result-grid">
          <Card className="dashboard-panel">
            <h2>{decision?.allowed ? "Allowed" : "Denied"}</h2>
            <p>{decision?.reason}</p>
            <div className="agent-passport__header"><ButtonLink href={dHref(`/dashboard/agents/${agent.agentId}`)}>Open agent</ButtonLink>{passportUrl ? <ButtonLink href={passportUrl}>Open passport</ButtonLink> : null}</div>
          </Card>
          <Card className="dashboard-panel">
            <h2>Manual test mode</h2>
            <p>Send this link to your agent so it can read the allowed scopes and ask you to verify actions.</p>
            <p>This does not automatically control the external agent. Developer integration is required for automatic enforcement.</p>
            <p className="field-help">Some agents cannot fetch passport links directly (for example, Gemini memory or ChatGPT system prompts). If the agent cannot read the link, open the passport page and paste the Agent memory block into the agent instead.</p>
            <CodeBlock label="copy into your agent">{instructions}</CodeBlock>
          </Card>
          <Card className="dashboard-panel">
            <h2>Developer integration</h2>
            <p>The API key was shown once during setup. Store it as <code>BEHALFID_API_KEY</code> and call verify before actions happen.</p>
            <CodeBlock label="verify.ts">{`import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
  baseUrl: "https://behalfid.com"
});

const result = await behalf.verify({
  agentId: "${agent.agentId}",
  action: "access_data",
  vendor: "gmail.com"
});`}</CodeBlock>
            <div className="agent-passport__header"><ButtonLink href="/docs/quickstart">Quickstart</ButtonLink><ButtonLink href="/docs/sdk">SDK docs</ButtonLink></div>
          </Card>
        </section>
      ) : null}
      </div>
      {apiKey && step < 5 ? <Secret value={apiKey} label="Agent API key" /> : null}
    </>
  );
}

function AgentView({ agentId }: { agentId: string }) {
  const { apiJson: api } = useDashboardApi();
  const detail = useResource<{ agent: Agent; permissions: Permission[]; logs: Log[]; workspaceAuthority?: WorkspaceAuthority | null }>(`/api/dashboard/agents/${agentId}`);
  const [secret, setSecret] = useState("");
  const [passportUrl, setPassportUrl] = useState("");
  const [form, setForm] = useState({
    template: "" as PermissionTemplate | "",
    action: "",
    resource: "",
    allowedActions: "",
    blockedActions: "",
    requiresApproval: false,
    maxAmount: "",
    expiresAt: "",
    scope: ""
  });
  const [agentViewScopeId, setAgentViewScopeId] = useState("");
  const [activePolicyTemplateId, setActivePolicyTemplateId] = useState("");
  const [policyApplying, setPolicyApplying] = useState(false);
  const [profile, setProfile] = useState<Partial<Pick<Agent, "name" | "provider" | "externalAgentId" | "externalAgentLabel" | "description" | "connectionStatus">>>({});
  const [guidelines, setGuidelines] = useState<string[]>([]);
  const [newGuideline, setNewGuideline] = useState("");
  const [guidelinesInitialized, setGuidelinesInitialized] = useState(false);
  const createPermission = async (event: FormEvent) => {
    event.preventDefault();
    const resolvedAction = form.action || form.template || "";
    await api(`/api/dashboard/agents/${agentId}/permissions`, {
      method: "POST",
      body: JSON.stringify({
        action: resolvedAction,
        resource: form.resource || undefined,
        scope: form.scope || undefined,
        allowedActions: form.allowedActions ? form.allowedActions.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        blockedActions: form.blockedActions ? form.blockedActions.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        requiresApproval: form.requiresApproval || undefined,
        template: form.template || undefined,
        constraints: {
          maxAmount: form.maxAmount ? Number(form.maxAmount) : undefined,
          allowedVendors: form.resource ? [form.resource] : undefined,
          expiresAt: form.expiresAt || undefined
        }
      })
    });
    await detail.reload();
  };

  const applyPolicyTemplate = (pt: PolicyTemplate) => {
    setActivePolicyTemplateId(pt.id);
    if (pt.permissions.length === 1) {
      const p = pt.permissions[0];
      const template = actionToPermTemplate(p.action);
      setForm({
        template,
        action: p.action,
        resource: p.resource,
        allowedActions: p.allowedActions.join(", "),
        blockedActions: p.blockedActions.join(", "),
        requiresApproval: p.requiresApproval,
        maxAmount: p.constraints?.maxAmount != null ? String(p.constraints.maxAmount) : "",
        expiresAt: "",
        scope: ""
      });
    }
  };

  const applyPolicyTemplateAll = async (pt: PolicyTemplate) => {
    if (pt.permissions.length <= 1) return;
    setPolicyApplying(true);
    try {
      for (const p of pt.permissions) {
        const template = actionToPermTemplate(p.action);
        await api(`/api/dashboard/agents/${agentId}/permissions`, {
          method: "POST",
          body: JSON.stringify({
            action: p.action,
            resource: p.resource || undefined,
            allowedActions: p.allowedActions,
            blockedActions: p.blockedActions,
            requiresApproval: p.requiresApproval,
            template: template || undefined,
            notes: p.notes || undefined,
            constraints: {
              maxAmount: p.constraints?.maxAmount,
              allowedVendors: p.constraints?.allowedVendors
            }
          })
        });
      }
      setActivePolicyTemplateId("");
      await detail.reload();
    } finally {
      setPolicyApplying(false);
    }
  };

  const rotate = async () => {
    if (!window.confirm("Rotate this agent API key? The old key will stop working immediately.")) return;
    setSecret((await api<{ apiKey: string }>(`/api/dashboard/agents/${agentId}/rotate-key`, { method: "POST" })).apiKey);
    await detail.reload();
  };
  const regeneratePassport = async () => {
    const result = await api<{ passportUrl: string }>(`/api/dashboard/agents/${agentId}/passport`, { method: "POST" });
    setPassportUrl(result.passportUrl);
    await detail.reload();
  };
  const setStatus = async (status: "enable" | "disable") => { await api(`/api/dashboard/agents/${agentId}/${status}`, { method: "POST" }); await detail.reload(); };
  const revoke = async (permissionId: string) => { await api(`/api/dashboard/agents/${agentId}/permissions/${permissionId}/revoke`, { method: "POST" }); await detail.reload(); };
  const updateProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail.data?.agent) return;
    const current = detail.data.agent;
    await api(`/api/dashboard/agents/${agentId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: profile.name ?? current.name,
        provider: profile.provider ?? current.provider,
        externalAgentId: profile.externalAgentId ?? current.externalAgentId ?? undefined,
        externalAgentLabel: profile.externalAgentLabel ?? current.externalAgentLabel ?? undefined,
        description: profile.description ?? current.description ?? undefined,
        connectionStatus: profile.connectionStatus ?? current.connectionStatus
      })
    });
    setProfile({});
    await detail.reload();
  };
  const agent = detail.data?.agent;
  const permissions = detail.data?.permissions ?? [];
  const workspaceAuthority = detail.data?.workspaceAuthority ?? null;
  const permissionAuthority = classifyFormPermissionAuthority(form);
  const canGrantSelectedPermission = permissionAuthority
    ? canGrantPermissionAuthority(workspaceAuthority, permissionAuthority.requiredAuthorityLevel)
    : true;
  const hasPermissions = permissions.some((permission) => permission.status === "active");

  if (agent && !guidelinesInitialized) {
    setGuidelines(agent.guidelines ?? []);
    setGuidelinesInitialized(true);
  }

  const addGuideline = () => {
    const trimmed = newGuideline.trim();
    if (!trimmed || guidelines.includes(trimmed) || guidelines.length >= 20) return;
    setGuidelines([...guidelines, trimmed]);
    setNewGuideline("");
  };

  const removeGuideline = (index: number) => setGuidelines(guidelines.filter((_, i) => i !== index));

  const saveGuidelines = async () => {
    await api(`/api/dashboard/agents/${agentId}`, {
      method: "PATCH",
      body: JSON.stringify({ guidelines })
    });
    await detail.reload();
  };

  return (
    <>
      <Header title={agent?.name ?? "Agent"} description={agent?.description ?? "Agent credentials, permissions, and verification logs."} action={<div className="form-actions"><Button onClick={rotate}>Rotate key</Button>{agent?.status === "active" ? <Button onClick={() => setStatus("disable")}>Disable</Button> : <Button onClick={() => setStatus("enable")}>Enable</Button>}</div>} />
      {secret ? <Secret value={secret} label="Rotated API key" /> : null}
      {agent ? (
        <Card className="dashboard-panel agent-passport">
          <div className="agent-passport__header">
            <span className="console-status console-status--active">{agent.agentType === "connected" ? "Connected" : "Native"}</span>
            <span className="console-status">{agent.provider}</span>
            <span className="console-status">{agent.connectionStatus}</span>
          </div>
          <p>{agent.agentType === "native" ? "Use this API key directly from your custom integration." : "Use this BehalfID credential to represent this external agent when your app verifies actions."}</p>
          {agent.agentType === "connected" ? <p>The agent description explains the agent&apos;s purpose. Permissions define what it is actually allowed to do.</p> : null}
          {agent.agentType === "connected" ? <p>Connected agents are manually represented today. Provider-native integrations are planned.</p> : null}
          <p className="field-help">Rotating this key invalidates the old key immediately. The new key is shown once and BehalfID stores only a hash.</p>
          <dl className="console-definition">
            <div><dt>Agent ID</dt><dd>{agent.agentId}</dd></div>
            <div><dt>Status</dt><dd>{agent.status}</dd></div>
            <div><dt>Created</dt><dd>{date(agent.createdAt)}</dd></div>
            <div><dt>Last used</dt><dd>{date(agent.lastUsedAt)}</dd></div>
            <div><dt>Key rotated</dt><dd>{date(agent.keyRotatedAt)}</dd></div>
          </dl>
        </Card>
      ) : null}
      <form className="dashboard-panel agent-edit-form" onSubmit={updateProfile}>
        <label><span>Name</span><input value={profile.name ?? agent?.name ?? ""} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></label>
        <label><span>Provider</span><select value={profile.provider ?? agent?.provider ?? "custom"} onChange={(e) => setProfile({ ...profile, provider: e.target.value as AgentProvider })}>{providerOptions.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}</select></label>
        <label><span>Connection status</span><select value={profile.connectionStatus ?? agent?.connectionStatus ?? "manual"} onChange={(e) => setProfile({ ...profile, connectionStatus: e.target.value as Agent["connectionStatus"] })}><option value="manual">Manual</option><option value="connected">Connected</option><option value="disconnected">Disconnected</option></select></label>
        <label><span>External reference</span><input placeholder="Optional: workspace name, URL, handle, or internal label" value={profile.externalAgentLabel ?? agent?.externalAgentLabel ?? ""} onChange={(e) => setProfile({ ...profile, externalAgentLabel: e.target.value })} /></label>
        <label className="agent-edit-form__full-col"><span>External ID</span><input value={profile.externalAgentId ?? agent?.externalAgentId ?? ""} onChange={(e) => setProfile({ ...profile, externalAgentId: e.target.value })} /></label>
        <label className="agent-edit-form__full-col"><span>Description</span><textarea rows={3} value={profile.description ?? agent?.description ?? ""} onChange={(e) => setProfile({ ...profile, description: e.target.value })} /></label>
        <div className="form-actions agent-edit-form__full-col">
          <Button variant="primary" type="submit">Save profile</Button>
        </div>
      </form>
      {agent ? (
        <section className="onboarding-result-grid onboarding-result-grid--native">
          <Card className="dashboard-panel">
            <h2>{agent.agentType === "connected" ? "Manual test mode" : "Developer integration"}</h2>
            <p>{agent.agentType === "connected" ? "Send this link to your agent so it can read the allowed scopes and ask you to verify actions. Automatic enforcement requires provider or app integration." : "Use this API key directly from your custom integration and call verify before actions happen."}</p>
            <Button onClick={regeneratePassport} type="button">{agent.publicPassportEnabled ? "Regenerate passport link" : "Create passport link"}</Button>
            {passportUrl ? <Secret value={passportUrl} label="Passport link" /> : null}
            {agent.agentType === "connected" ? <p className="field-help">Treat this passport link like a secret. Anyone with the token can view this agent&apos;s allowed scopes and run manual previews.</p> : null}
            {agent.agentType === "connected" ? <p className="field-help">Some agents cannot fetch passport links directly (e.g. Gemini memory, ChatGPT system prompts). If the agent cannot read the link, open the passport page and paste the Agent memory block into the agent instead.</p> : null}
            {agent.publicPassportTokenPreview ? <p>Current passport token: <code>{agent.publicPassportTokenPreview}</code></p> : null}
          </Card>
          {agent.agentType === "connected" ? (
            <details className="dashboard-panel developer-integration-details">
              <summary className="developer-integration-summary">For developers — SDK integration</summary>
              <p>When your app or provider can call BehalfID, use the SDK/API for automatic enforcement.</p>
              <CodeBlock label="verify.ts">{buildVerifySnippet(agent.agentId, detail.data?.permissions)}</CodeBlock>
            </details>
          ) : (
            <Card className="dashboard-panel">
              <h2>Manual testing</h2>
              <p>Native agents can also use a passport link for manual allow/deny testing.</p>
              <CodeBlock label="verify.ts">{buildVerifySnippet(agent.agentId, detail.data?.permissions)}</CodeBlock>
            </Card>
          )}
        </section>
      ) : null}
      <section className="dashboard-panel">
        <h2>Guidelines</h2>
        <p className="field-help">Behavioral rules for this agent — things it should always or never do, regardless of which service it&apos;s accessing. These appear in the MCP context and permission passport.</p>
        {guidelines.length > 0 ? (
          <ul className="guidelines-list">
            {guidelines.map((g, i) => (
              <li key={i}>
                <span>{g}</span>
                <Button type="button" onClick={() => removeGuideline(i)}>Remove</Button>
              </li>
            ))}
          </ul>
        ) : <p className="field-help">No guidelines yet.</p>}
        <label>
          <span>Add guideline</span>
          <input
            placeholder="e.g. Never commit directly to main, Always ask before deleting files"
            value={newGuideline}
            onChange={(e) => setNewGuideline(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGuideline(); } }}
            maxLength={500}
          />
          <small className="field-help">Press Enter or click Add. Max 20 guidelines, 500 characters each.</small>
        </label>
        <div className="form-actions">
          <Button type="button" onClick={addGuideline} disabled={!newGuideline.trim() || guidelines.length >= 20}>Add</Button>
          <Button variant="primary" type="button" onClick={saveGuidelines}>Save guidelines</Button>
        </div>
      </section>
      <form className="dashboard-panel" onSubmit={createPermission}>
        <h2>Add permission</h2>
        <p className="field-help">Permissions define which actions this agent can take. Start narrow: allow one useful action and explicitly block risky ones.</p>
        {workspaceAuthority ? (
          <p className="field-help">
            Your delegated role: <strong>{workspaceAuthority.roleLabel}</strong> (authority {workspaceAuthority.authorityLevel})
          </p>
        ) : null}
        {permissionAuthority ? (
          <p className="field-help">
            Requires: <strong>{getRequiredRoleLabel(permissionAuthority.requiredAuthorityLevel)}</strong>
            {!canGrantSelectedPermission ? (
              <span className="form-error"> — you do not have authority to grant this permission.</span>
            ) : null}
          </p>
        ) : null}
        <div className="policy-template-section">
          <span className="field-label">Policy templates</span>
          <p className="field-help">Pre-built policies for real developer workflows. Single-permission templates populate the form below for editing. Multi-permission templates are applied immediately.</p>
          <div className="permission-template-grid permission-template-grid--nested">
            {POLICY_TEMPLATES.map((pt) => (
              <button
                key={pt.id}
                type="button"
                className={activePolicyTemplateId === pt.id ? "permission-template permission-template--active" : "permission-template"}
                onClick={() => {
                  if (pt.permissions.length === 1) {
                    applyPolicyTemplate(pt);
                  } else {
                    setActivePolicyTemplateId(activePolicyTemplateId === pt.id ? "" : pt.id);
                  }
                }}
              >
                <strong>{pt.label}</strong>
                <span>{pt.tagline}</span>
                <small>{POLICY_CATEGORY_LABELS[pt.category]} · {pt.permissions.length === 1 ? "1 permission" : `${pt.permissions.length} permissions`}</small>
              </button>
            ))}
          </div>
          {activePolicyTemplateId && (() => {
            const pt = POLICY_TEMPLATES.find((t) => t.id === activePolicyTemplateId);
            if (!pt || pt.permissions.length <= 1) return null;
            return (
              <div className="policy-template-multi-preview dashboard-panel" style={{ marginTop: 12 }}>
                <strong>Permissions that will be created:</strong>
                <ul style={{ margin: "8px 0", paddingLeft: 18 }}>
                  {pt.permissions.map((p, i) => (
                    <li key={i}>
                      <strong>{p.action}</strong> on <code>{p.resource}</code>{p.requiresApproval ? " — requires approval" : " — auto-allowed"}
                    </li>
                  ))}
                </ul>
                <p className="field-help">Blocks: {pt.blocks.join(", ")}.</p>
                <Button type="button" variant="primary" onClick={() => applyPolicyTemplateAll(pt)} disabled={policyApplying}>
                  {policyApplying ? "Applying…" : `Apply ${pt.permissions.length} permissions`}
                </Button>
                <Button type="button" onClick={() => setActivePolicyTemplateId("")}>Cancel</Button>
              </div>
            );
          })()}
        </div>
        {!hasPermissions ? (
          <div className="permission-template-grid permission-template-grid--nested">
            {FIRST_PERMISSION_EXAMPLES.map((example) => (
              <button
                className="permission-template"
                key={example}
                type="button"
                onClick={() => {
                  if (example.includes("web")) {
                    setForm({ ...form, template: "access_data", action: "browse_web", resource: "web", allowedActions: "browse_web", blockedActions: "checkout, submit_form, purchase" });
                  } else if (example.includes("calendar")) {
                    setForm({ ...form, template: "schedule", action: "read_calendar", resource: "google-calendar", allowedActions: "read_calendar", blockedActions: "send_invites, delete_events" });
                  } else if (example.includes("purchases")) {
                    setForm({ ...form, template: "purchase", action: "purchase", resource: "shop.example", allowedActions: "purchase", blockedActions: "purchase over limit", maxAmount: "25" });
                  } else {
                    setForm({ ...form, template: "custom", action: "checkout", resource: "web", allowedActions: "", blockedActions: "checkout, send_email" });
                  }
                }}
              >
                <strong>{example}</strong>
              </button>
            ))}
          </div>
        ) : null}
        <label>
          <span>Scope template</span>
          <select value={agentViewScopeId} onChange={(e) => {
            const scopeId = e.target.value;
            setAgentViewScopeId(scopeId);
            if (!scopeId) return;
            const scope = SCOPE_TEMPLATES.find((t) => t.id === scopeId);
            if (!scope || scope.id === "custom") return;
            const template = actionToPermTemplate(scope.defaultAction);
            setForm({
              template,
              action: scope.defaultAction,
              resource: scope.exampleResource,
              allowedActions: scope.defaultAllowedActions.join(", "),
              blockedActions: scope.defaultBlockedActions.join(", "),
              requiresApproval: scope.requiresApprovalDefault,
              maxAmount: "",
              expiresAt: "",
              scope: ""
            });
          }}>
            <option value="">Select a scope template (optional)</option>
            {SCOPE_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <small className="field-help">Scopes are reusable permission patterns. You can edit the fields below before saving.</small>
        </label>
        <label>
          <span>Template</span>
          <select value={form.template} onChange={(e) => {
            const t = e.target.value as PermissionTemplate | "";
            const presets: Partial<Record<PermissionTemplate, string>> = {
              access_data: "access_data", create_content: "create_content", schedule: "schedule", purchase: "purchase"
            };
            setForm({ ...form, template: t, action: presets[t as PermissionTemplate] ?? form.action });
          }}>
            <option value="">No template</option>
            {permissionTemplates.map((t) => <option key={t.value} value={t.value}>{t.title}</option>)}
          </select>
        </label>
        <label>
          <span>Action</span>
          <input placeholder="access_data, schedule, purchase" required value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} />
        </label>
        <label>
          <span>Resource / service</span>
          <input placeholder="gmail.com, google-calendar, coachella.com" value={form.resource} onChange={(e) => setForm({ ...form, resource: e.target.value })} />
        </label>
        <label>
          <span>Allowed actions</span>
          <input placeholder="read labels, summarize docs, suggest times" value={form.allowedActions} onChange={(e) => setForm({ ...form, allowedActions: e.target.value })} />
          <small className="field-help">Comma-separated — what this permission explicitly allows.</small>
        </label>
        <label>
          <span>Blocked actions</span>
          <input placeholder="send email, delete files, make purchases" value={form.blockedActions} onChange={(e) => setForm({ ...form, blockedActions: e.target.value })} />
          <small className="field-help">Comma-separated — what this agent must never do.</small>
        </label>
        {form.template !== "purchase" ? (
          <label>
            <span>Requires approval</span>
            <select value={form.requiresApproval ? "yes" : "no"} onChange={(e) => setForm({ ...form, requiresApproval: e.target.value === "yes" })}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
        ) : null}
        {form.template === "purchase" ? (
          <label>
            <span>Max amount</span>
            <input min="0" placeholder="Optional, e.g. 800" type="number" value={form.maxAmount} onChange={(e) => setForm({ ...form, maxAmount: e.target.value })} />
          </label>
        ) : null}
        <label>
          <span>Expires at</span>
          <input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
        </label>
        <Button variant="primary" type="submit" disabled={!canGrantSelectedPermission || workspaceAuthority?.authorityLevel === 10}>
          Create permission
        </Button>
      </form>
      <section className="dashboard-panel">
        <h2>Permissions</h2>
        {!permissions.length ? <EmptyState className="dashboard-empty">No permissions yet. Add one above before this agent can be allowed to do anything.</EmptyState> : null}
        <div className="dashboard-list">{permissions.map((p) => <div key={p.permissionId}><span><strong>{p.action}</strong><small>{dashboardPermissionSummary(p)}{p.requiredAuthorityLevel != null ? ` · requires ${getRequiredRoleLabel(p.requiredAuthorityLevel)}` : ""}</small></span><Badge>{p.status}</Badge>{p.status === "active" ? <Button onClick={() => revoke(p.permissionId)}>Revoke</Button> : null}</div>)}</div>
      </section>
      {hasPermissions ? (
        <section className="dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <h2>Try a verification</h2>
              <p>Use the sandbox or the snippet below to confirm that allowed actions pass and denied actions stop before execution.</p>
            </div>
            <ButtonLink href="/sandbox" target="_blank" rel="noopener noreferrer">Open sandbox</ButtonLink>
          </div>
          <CodeBlock label="verify.ts">{buildVerifySnippet(agentId, permissions)}</CodeBlock>
        </section>
      ) : null}
      <section className="dashboard-panel">
        <h2>Recent logs</h2>
        <LogList logs={detail.data?.logs ?? []} />
      </section>
    </>
  );
}

function WebhooksView() {
  const { apiJson: api } = useDashboardApi();
  const { href: dHref } = useDashboardPaths();
  const resource = useResource<{ webhooks: Webhook[]; eventTypes: string[]; plan: Plan; webhooksEnabled: boolean; upgradeHint: string | null }>("/api/dashboard/webhooks");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [webhookError, setWebhookError] = useState("");
  const events = useMemo(() => ["verification.allowed", "verification.denied", "agent.key_rotated", "permission.revoked"], []);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    setWebhookError("");
    try {
      const result = await api<{ secret: string }>("/api/dashboard/webhooks", { method: "POST", body: JSON.stringify({ url, events }) });
      setSecret(result.secret);
      setUrl("");
      await resource.reload();
    } catch (err) {
      setWebhookError(err instanceof Error ? err.message : "Webhook creation failed.");
    }
  };
  const webhooksEnabled = resource.data?.webhooksEnabled ?? false;
  return (
    <>
      <Header title="Webhooks" description="Manage event delivery endpoints and signing secrets." action={webhooksEnabled ? <ButtonLink variant="secondary" href={dHref("/dashboard/billing")}>Manage billing</ButtonLink> : undefined} />
      {resource.error ? <p className="form-error" role="alert">{resource.error}</p> : null}
      {!webhooksEnabled ? (
        <Card className="dashboard-panel webhook-gate-card">
          <div className="dashboard-section-header">
            <div>
              <div className="agent-passport__header">
                <Badge>Free plan</Badge>
                <Badge>Webhooks disabled</Badge>
              </div>
              <h2>Webhooks require Pro.</h2>
              <p>Free accounts can create agents and call verify, but webhook delivery is disabled until the account upgrades. Existing endpoints stay disabled after downgrade so verification still fails closed without silent delivery.</p>
            </div>
            <ButtonLink variant="primary" href={dHref("/dashboard/billing")}>Upgrade to Pro</ButtonLink>
          </div>
        </Card>
      ) : null}
      <Card className="dashboard-panel webhook-form-card">
        <h2>Create webhook</h2>
        <form className="inline-form" onSubmit={create}>
          <label>
            <span>Endpoint URL</span>
            <input disabled={!webhooksEnabled} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhooks/behalfid" required value={url} />
          </label>
          <Button disabled={!webhooksEnabled} variant="primary">Create</Button>
        </form>
        {webhookError ? <p className="form-error" role="alert">{webhookError}</p> : null}
        {secret ? <Secret value={secret} label="Signing secret" /> : null}
      </Card>
      <Rows items={resource.data?.webhooks ?? []} href={(w) => dHref(`/dashboard/webhooks/${w.webhookId}`)} title={(w) => w.url} meta={(w) => `${w.status} / ${w.events.join(", ")}`} />
    </>
  );
}

function WebhookView({ webhookId }: { webhookId: string }) {
  const { apiJson: api } = useDashboardApi();
  const detail = useResource<{ webhook: Webhook; deliveries: Delivery[] }>(`/api/dashboard/webhooks/${webhookId}`);
  const [secret, setSecret] = useState("");
  const rotate = async () => setSecret((await api<{ secret: string }>(`/api/dashboard/webhooks/${webhookId}/rotate-secret`, { method: "POST" })).secret);
  const setStatus = async (status: "enable" | "disable") => { await api(`/api/dashboard/webhooks/${webhookId}/${status}`, { method: "POST" }); await detail.reload(); };
  const webhook = detail.data?.webhook;
  return (
    <>
      <Header title="Webhook" description={webhook?.url ?? ""} action={<div className="form-actions"><Button onClick={rotate}>Rotate secret</Button>{webhook?.status === "active" ? <Button onClick={() => setStatus("disable")}>Disable</Button> : <Button onClick={() => setStatus("enable")}>Enable</Button>}</div>} />
      {secret ? <Secret value={secret} label="Rotated signing secret" /> : null}
      {webhook ? (
        <Card className="dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <strong>{webhook.url}</strong>
              <p className="field-help">Secret preview: {webhook.secretPreview}</p>
            </div>
            <Badge>{webhook.status}</Badge>
          </div>
        </Card>
      ) : null}
      <section className="dashboard-panel">
        <h2>Delivery history</h2>
        <div className="dashboard-list">
          {(detail.data?.deliveries ?? []).map((d) => (
            <div key={d.deliveryId}>
              <span>
                <strong>{d.eventType}</strong>
                <small>{d.eventId} · attempt {d.attempt}{d.error ? ` · ${d.error}` : ""}</small>
              </span>
              <Badge>{d.status}</Badge>
            </div>
          ))}
        </div>
        {!(detail.data?.deliveries ?? []).length && detail.data ? <EmptyState className="dashboard-empty">No deliveries yet.</EmptyState> : null}
      </section>
    </>
  );
}

function LogsViewInner() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get("search");
  const initialAgentId = searchParams.get("agentId");
  return <OpsLogConsole initialSearch={initialSearch ?? undefined} initialAgentId={initialAgentId ?? undefined} />;
}

function LogsView() {
  return (
    <Suspense fallback={<OpsLogConsole compact title="Audit logs" description="Loading logs…" />}>
      <LogsViewInner />
    </Suspense>
  );
}

function ApprovalsViewInner() {
  const searchParams = useSearchParams();
  const highlightApprovalId = searchParams.get("highlight");
  return <PendingActionsQueue highlightApprovalId={highlightApprovalId} />;
}

function ApprovalsView() {
  return (
    <Suspense fallback={<PendingActionsQueue />}>
      <ApprovalsViewInner />
    </Suspense>
  );
}

function classifyFormPermissionAuthority(form: {
  action: string;
  template: PermissionTemplate | "";
  resource: string;
  allowedActions: string;
  blockedActions: string;
  requiresApproval: boolean;
}) {
  const action = form.action || form.template || "";
  if (!action) return null;
  return classifyPermissionRisk({
    action,
    resource: form.resource || undefined,
    allowedActions: form.allowedActions
      ? form.allowedActions.split(",").map((item) => item.trim()).filter(Boolean)
      : undefined,
    blockedActions: form.blockedActions
      ? form.blockedActions.split(",").map((item) => item.trim()).filter(Boolean)
      : undefined,
    requiresApproval: form.requiresApproval
  });
}

function canGrantPermissionAuthority(workspaceAuthority: WorkspaceAuthority | null | undefined, requiredAuthorityLevel: number) {
  if (!workspaceAuthority) return true;
  return workspaceAuthority.authorityLevel >= requiredAuthorityLevel;
}

function approvalActionLabel(action: string, vendor?: string | null) {
  const base = action.replace(/_/g, " ");
  return vendor ? `${base} → ${vendor}` : base;
}


function InboxView() {
  const { apiJson: api } = useDashboardApi();
  const inbox = useResource<{ pendingApprovals: ApprovalRequest[]; deniedHighRisk: Log[]; workspaceAuthority?: WorkspaceAuthority | null }>("/api/dashboard/inbox");
  const [working, setWorking] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState("");

  const resolve = async (approvalId: string, action: "approve" | "deny") => {
    setWorking(approvalId);
    setResolveError("");
    try {
      await api(`/api/dashboard/approvals/${approvalId}/${action}`, { method: "POST" });
      await inbox.reload();
    } catch (e) {
      setResolveError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setWorking(null);
    }
  };

  return (
    <OpsInboxConsole
      inbox={inbox}
      working={working}
      resolveError={resolveError}
      onResolve={resolve}
      dateFormatter={date}
    />
  );
}

function MembersPanel() {
  const { apiJson: api } = useDashboardApi();
  const members = useResource<{
    members: AccountMember[];
    pendingInvites: PendingInvite[];
    canManageMembers: boolean;
    workspaceAuthority?: WorkspaceAuthority | null;
  }>("/api/dashboard/members");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("ENGINEER");
  const [memberError, setMemberError] = useState("");
  const [lastInviteUrl, setLastInviteUrl] = useState("");

  const addMember = async (event: FormEvent) => {
    event.preventDefault();
    setMemberError("");
    setLastInviteUrl("");
    try {
      const result = await api<{ member?: AccountMember; invite?: PendingInvite }>("/api/dashboard/members", {
        method: "POST",
        body: JSON.stringify({ email, role })
      });
      if (result.invite?.acceptUrl) {
        setLastInviteUrl(result.invite.acceptUrl);
      }
      setEmail("");
      await members.reload();
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : "Could not add member.");
    }
  };

  const updateRole = async (membershipId: string, nextRole: string) => {
    setMemberError("");
    try {
      await api(`/api/dashboard/members/${membershipId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole })
      });
      await members.reload();
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : "Could not update role.");
    }
  };

  const removeMember = async (membershipId: string) => {
    setMemberError("");
    try {
      await api(`/api/dashboard/members/${membershipId}`, { method: "DELETE" });
      await members.reload();
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : "Could not remove member.");
    }
  };

  const revokeInvite = async (inviteId: string) => {
    setMemberError("");
    try {
      await api(`/api/dashboard/members/invites/${inviteId}`, { method: "DELETE" });
      await members.reload();
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : "Could not revoke invite.");
    }
  };

  return (
    <Card className="dashboard-panel">
      <div className="dashboard-section-header">
        <div>
          <h2>Delegated Permissions</h2>
          <p className="field-help">Your role controls which agent permissions you can grant or approve. You can only assign roles below your own.</p>
          <p className="field-help">
            If someone already has a BehalfID account, they are added to this workspace immediately. New email addresses receive a pending invite and a shareable invite link.
          </p>
        </div>
      </div>
      {members.data?.workspaceAuthority ? (
        <p className="field-help">
          Your role: <strong>{members.data.workspaceAuthority.roleLabel}</strong> (authority {members.data.workspaceAuthority.authorityLevel})
        </p>
      ) : null}
      {memberError ? <p className="form-error">{memberError}</p> : null}
      {lastInviteUrl ? (
        <p className="field-help">
          Share this invite link: <code className="invite-link">{lastInviteUrl}</code>
        </p>
      ) : null}
      <div className="dashboard-list">
        {(members.data?.members ?? []).map((member) => (
          <div key={member.membershipId} className="member-row member-row--active">
            <span>
              <strong>{member.email ?? member.userId}</strong>
              <small>{member.role} · active member</small>
            </span>
            {members.data?.canManageMembers ? (
              <span className="approval-actions">
                <select
                  value={member.role}
                  onChange={(event) => void updateRole(member.membershipId, event.target.value)}
                >
                  <option value="ENGINEERING_LEAD">Engineering Lead</option>
                  <option value="SENIOR_ENGINEER">Senior Engineer</option>
                  <option value="ENGINEER">Engineer</option>
                  <option value="VIEWER">Viewer</option>
                </select>
                <Button type="button" onClick={() => void removeMember(member.membershipId)}>Remove</Button>
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {(members.data?.pendingInvites ?? []).length > 0 ? (
        <>
          <h3>Pending invites</h3>
          <div className="dashboard-list">
            {members.data?.pendingInvites.map((invite) => (
              <div key={invite.inviteId} className="member-row member-row--pending">
                <span>
                  <strong>{invite.email}</strong>
                  <small>{invite.role} · pending invite</small>
                </span>
                {members.data?.canManageMembers ? (
                  <Button type="button" onClick={() => void revokeInvite(invite.inviteId)}>Revoke</Button>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : null}
      {members.data?.canManageMembers ? (
        <form className="inline-form" onSubmit={addMember}>
          <label>
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="engineer@company.com" />
          </label>
          <label>
            <span>Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="ENGINEERING_LEAD">Engineering Lead</option>
              <option value="SENIOR_ENGINEER">Senior Engineer</option>
              <option value="ENGINEER">Engineer</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </label>
          <Button variant="primary" type="submit">Add member</Button>
        </form>
      ) : null}
    </Card>
  );
}

function SettingsView() {
  const { apiJson: api } = useDashboardApi();
  const { href: dHref } = useDashboardPaths();
  const settings = useResource<{
    email: string;
    appUrl: string;
    apiUsage: string;
    dangerZone: string;
    workspaceSlug?: string | null;
    delegatedPermissions?: WorkspaceAuthority | null;
    profile?: {
      firstName: string | null;
      lastName: string | null;
      jobTitle: string | null;
      phone: string | null;
    } | null;
    account?: {
      accountType: string | null;
      companyName: string | null;
      workspaceName: string | null;
      website: string | null;
      teamSize: string | null;
      onboarding?: {
        agentTools?: string[];
        agentToolsOther?: string;
        controlAreas?: string[];
        controlAreasOther?: string;
        primaryGoal?: string;
        firstSetupGoal?: string;
      } | null;
    } | null;
    canEditAccountFields?: boolean;
  }>("/api/dashboard/settings");
  const tokens = useResource<{ tokens: DeveloperToken[] }>("/api/dashboard/tokens");
  const workspace = useOptionalWorkspace();
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [newToken, setNewToken] = useState("");
  const [profileForm, setProfileForm] = useState({
    firstName: "",
    lastName: "",
    jobTitle: "",
    phone: ""
  });
  const [accountForm, setAccountForm] = useState({
    companyName: "",
    workspaceName: "",
    website: "",
    teamSize: "",
    agentTools: [] as string[],
    agentToolsOther: "",
    controlAreas: [] as string[],
    controlAreasOther: "",
    primaryGoal: "",
    firstSetupGoal: ""
  });
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  const workspaceSlug =
    workspace?.workspaceSlug ?? settings.data?.workspaceSlug ?? null;
  const workspaceUrl = workspaceSlug
    ? `${settings.data?.appUrl?.replace(/\/$/, "") ?? "https://behalfid.com"}/${workspaceSlug}/dashboard`
    : null;

  const copyWorkspaceUrl = async () => {
    if (!workspaceUrl) return;
    try {
      await navigator.clipboard.writeText(workspaceUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      setCopiedUrl(false);
    }
  };

  useEffect(() => {
    if (!settings.data) return;
    setProfileForm({
      firstName: settings.data.profile?.firstName ?? "",
      lastName: settings.data.profile?.lastName ?? "",
      jobTitle: settings.data.profile?.jobTitle ?? "",
      phone: settings.data.profile?.phone ?? ""
    });
    setAccountForm({
      companyName: settings.data.account?.companyName ?? "",
      workspaceName: settings.data.account?.workspaceName ?? "",
      website: settings.data.account?.website ?? "",
      teamSize: settings.data.account?.teamSize ?? "",
      agentTools: settings.data.account?.onboarding?.agentTools ?? [],
      agentToolsOther: settings.data.account?.onboarding?.agentToolsOther ?? "",
      controlAreas: settings.data.account?.onboarding?.controlAreas ?? [],
      controlAreasOther: settings.data.account?.onboarding?.controlAreasOther ?? "",
      primaryGoal: settings.data.account?.onboarding?.primaryGoal ?? "",
      firstSetupGoal: settings.data.account?.onboarding?.firstSetupGoal ?? ""
    });
  }, [settings.data]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaveError("");
    setSaveMessage("");
    try {
      await api("/api/dashboard/settings", {
        method: "PATCH",
        body: JSON.stringify(profileForm)
      });
      setSaveMessage("Profile updated.");
      await settings.reload();
    } catch (requestError) {
      setSaveError(requestError instanceof Error ? requestError.message : "Failed to save profile.");
    }
  };

  const saveAccount = async (event: FormEvent) => {
    event.preventDefault();
    setSaveError("");
    setSaveMessage("");
    try {
      await api("/api/dashboard/settings", {
        method: "PATCH",
        body: JSON.stringify({
          companyName: accountForm.companyName,
          workspaceName: accountForm.workspaceName,
          website: accountForm.website,
          teamSize: accountForm.teamSize || undefined,
          agentTools: accountForm.agentTools,
          agentToolsOther: accountForm.agentToolsOther,
          controlAreas: accountForm.controlAreas,
          controlAreasOther: accountForm.controlAreasOther,
          primaryGoal: accountForm.primaryGoal || undefined,
          firstSetupGoal: accountForm.firstSetupGoal || undefined
        })
      });
      setSaveMessage("Workspace settings updated.");
      await settings.reload();
    } catch (requestError) {
      setSaveError(requestError instanceof Error ? requestError.message : "Failed to save workspace settings.");
    }
  };

  const createToken = async (event: FormEvent) => {
    event.preventDefault();
    const result = await api<{ token: string }>("/api/dashboard/tokens", {
      method: "POST",
      body: JSON.stringify({ name: tokenName })
    });
    setNewToken(result.token);
    setTokenName("");
    await tokens.reload();
  };

  const revokeToken = async (tokenId: string) => {
    await api(`/api/dashboard/tokens/${tokenId}`, { method: "DELETE" });
    await tokens.reload();
  };

  return (
    <>
      <Header title="Settings" description="Manage account details and developer tokens." />
      {saveMessage ? <p className="setup-banner" role="status">{saveMessage}</p> : null}
      {saveError ? <p className="form-error" role="alert">{saveError}</p> : null}
      <Card className="dashboard-panel">
        <div className="dashboard-section-header">
          <h2>Managed profiles</h2>
        </div>
        <p className="field-help">
          Configure when local Claude, Codex, and Cursor sessions run unmanaged, managed, or required.
        </p>
        <ButtonLink href={dHref("/dashboard/managed-profiles")} variant="secondary">
          Open managed profiles
        </ButtonLink>
      </Card>
      <Card className="dashboard-panel">
        <div className="dashboard-section-header">
          <h2>Profile</h2>
        </div>
        <form className="setup-form" onSubmit={saveProfile}>
          <label>
            <span>First name</span>
            <input onChange={(event) => setProfileForm((prev) => ({ ...prev, firstName: event.target.value }))} value={profileForm.firstName} />
          </label>
          <label>
            <span>Last name</span>
            <input onChange={(event) => setProfileForm((prev) => ({ ...prev, lastName: event.target.value }))} value={profileForm.lastName} />
          </label>
          <label>
            <span>Email</span>
            <input disabled readOnly value={settings.data?.email ?? ""} />
          </label>
          <label>
            <span>Phone <small>(optional)</small></span>
            <input onChange={(event) => setProfileForm((prev) => ({ ...prev, phone: event.target.value }))} value={profileForm.phone} />
          </label>
          <label>
            <span>Job title <small>(optional)</small></span>
            <input onChange={(event) => setProfileForm((prev) => ({ ...prev, jobTitle: event.target.value }))} value={profileForm.jobTitle} />
          </label>
          <div className="setup-actions">
            <Button type="submit" variant="primary">Save profile</Button>
          </div>
        </form>
      </Card>
      <Card className="dashboard-panel">
        <div className="dashboard-section-header">
          <h2>Workspace</h2>
        </div>
        {workspaceUrl ? (
          <div className="account-details" style={{ marginBottom: "1rem" }}>
            <div className="account-details__row">
              <span className="account-details__label">Workspace URL</span>
              <span className="account-details__value" style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <code>{workspaceUrl}</code>
                <Button type="button" variant="secondary" onClick={() => void copyWorkspaceUrl()}>
                  {copiedUrl ? "Copied" : "Copy"}
                </Button>
              </span>
            </div>
            <p className="field-help">Stable workspace address. Slug changes are not available in this release.</p>
          </div>
        ) : null}
        {settings.data ? (
          <div className="account-details">
            <div className="account-details__row">
              <span className="account-details__label">Account type</span>
              <span className="account-details__value">
                {settings.data.account?.accountType === "business"
                  ? "Business / team"
                  : settings.data.account?.accountType === "individual"
                    ? "Individual"
                    : "Not set"}
              </span>
            </div>
            <div className="account-details__row">
              <span className="account-details__label">Delegated Permissions role</span>
              <span className="account-details__value">
                {settings.data.delegatedPermissions
                  ? `${settings.data.delegatedPermissions.roleLabel} (authority ${settings.data.delegatedPermissions.authorityLevel})`
                  : "Owner (authority 100)"}
              </span>
            </div>
          </div>
        ) : null}
        {settings.data?.canEditAccountFields ? (
          <form className="setup-form" onSubmit={saveAccount}>
            {settings.data.account?.accountType === "business" ? (
              <label>
                <span>Company name</span>
                <input onChange={(event) => setAccountForm((prev) => ({ ...prev, companyName: event.target.value }))} value={accountForm.companyName} />
              </label>
            ) : null}
            <label>
              <span>Workspace name</span>
              <input onChange={(event) => setAccountForm((prev) => ({ ...prev, workspaceName: event.target.value }))} value={accountForm.workspaceName} />
            </label>
            {settings.data.account?.accountType === "business" ? (
              <>
                <label>
                  <span>Website <small>(optional)</small></span>
                  <input onChange={(event) => setAccountForm((prev) => ({ ...prev, website: event.target.value }))} value={accountForm.website} />
                </label>
                <label>
                  <span>Team size <small>(optional)</small></span>
                  <input onChange={(event) => setAccountForm((prev) => ({ ...prev, teamSize: event.target.value }))} value={accountForm.teamSize} />
                </label>
              </>
            ) : null}
            <fieldset className="setup-fieldset">
              <legend>Agent tools</legend>
              <div className="setup-checkgrid setup-checkgrid--settings">
                {AGENT_TOOLS.map((tool) => (
                  <label className="setup-check setup-check--setting" key={tool}>
                    <input
                      checked={accountForm.agentTools.includes(tool)}
                      onChange={() => setAccountForm((prev) => ({
                        ...prev,
                        agentTools: prev.agentTools.includes(tool)
                          ? prev.agentTools.filter((value) => value !== tool)
                          : [...prev.agentTools, tool]
                      }))}
                      type="checkbox"
                    />
                    <span className="setup-check__body">
                      <span className="setup-check__label">{AGENT_TOOL_LABELS[tool]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="setup-fieldset">
              <legend>Control areas</legend>
              <div className="setup-checkgrid setup-checkgrid--settings">
                {CONTROL_AREAS.map((area) => (
                  <label className="setup-check setup-check--setting" key={area}>
                    <input
                      checked={accountForm.controlAreas.includes(area)}
                      onChange={() => setAccountForm((prev) => ({
                        ...prev,
                        controlAreas: prev.controlAreas.includes(area)
                          ? prev.controlAreas.filter((value) => value !== area)
                          : [...prev.controlAreas, area]
                      }))}
                      type="checkbox"
                    />
                    <span className="setup-check__body">
                      <span className="setup-check__label">{CONTROL_AREA_LABELS[area]}</span>
                      <span className="setup-check__hint">{CONTROL_POLICY_HINTS[area]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              <span>Primary goal</span>
              <select
                onChange={(event) => setAccountForm((prev) => ({ ...prev, primaryGoal: event.target.value }))}
                value={accountForm.primaryGoal}
              >
                <option value="">Select…</option>
                {PRIMARY_GOALS.map((goal) => (
                  <option key={goal} value={goal}>{PRIMARY_GOAL_LABELS[goal]}</option>
                ))}
              </select>
            </label>
            <div className="setup-actions">
              <Button type="submit" variant="primary">Save workspace</Button>
            </div>
          </form>
        ) : (
          <p className="field-help">Workspace fields can be edited by Owners and Engineering Leads.</p>
        )}
      </Card>
      <Card className="dashboard-panel">
        <div className="dashboard-section-header">
          <h2>Account</h2>
        </div>
        {settings.data ? (
          <div className="account-details">
            <div className="account-details__row">
              <span className="account-details__label">App URL</span>
              <span className="account-details__value">{settings.data.appUrl}</span>
            </div>
            <div className="account-details__row">
              <span className="account-details__label">API usage</span>
              <span className="account-details__value">{settings.data.apiUsage}</span>
            </div>
            <div className="account-details__row">
              <span className="account-details__label">Danger zone</span>
              <span className="account-details__value">
                {settings.data.dangerZone.includes(SUPPORT_EMAIL) ? (
                  <>
                    {settings.data.dangerZone.slice(0, settings.data.dangerZone.indexOf(SUPPORT_EMAIL))}
                    <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
                    {settings.data.dangerZone.slice(settings.data.dangerZone.indexOf(SUPPORT_EMAIL) + SUPPORT_EMAIL.length)}
                  </>
                ) : (
                  settings.data.dangerZone
                )}
              </span>
            </div>
          </div>
        ) : null}
      </Card>
      <MembersPanel />
      <section className="dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <h2>Developer API tokens</h2>
            <p className="field-help">Account-scoped credentials for SDK/API calls that need developer context. Tokens are shown once and stored hashed.</p>
          </div>
        </div>
        <form className="inline-form" onSubmit={createToken}>
          <label>
            <span>Token name</span>
            <input maxLength={120} onChange={(event) => setTokenName(event.target.value)} placeholder="CI, local dev, staging" required value={tokenName} />
          </label>
          <Button variant="primary" type="submit">Create token</Button>
        </form>
        {newToken ? <Secret label="Developer API token" value={newToken} /> : null}
        <div className="dashboard-list">
          {(tokens.data?.tokens ?? []).map((token) => (
            <div key={token.tokenId}>
              <span>
                <strong>{token.name}</strong>
                <small>{token.tokenPreview ?? "Preview unavailable"} · created {date(token.createdAt)} · last used {date(token.lastUsedAt)}</small>
              </span>
              <Button onClick={() => revokeToken(token.tokenId)} type="button">Revoke</Button>
            </div>
          ))}
        </div>
        {tokens.data && tokens.data.tokens.length === 0 ? <EmptyState className="dashboard-empty">No developer tokens yet.</EmptyState> : null}
      </section>
    </>
  );
}

const DOC_CARDS = [
  { title: "Quickstart", description: "Create an agent, add a permission, call verify(), and prove allowed and denied actions.", href: "/docs/quickstart" },
  { title: "CLI & MCP", description: "Install the CLI, wire up the MCP server, and launch Claude Code or Codex with enforcement active.", href: "/docs/cli" },
  { title: "Managed profiles", description: "Configure when local Claude, Codex, and Cursor sessions run unmanaged, managed, or required.", href: "/dashboard/managed-profiles" },
  { title: "Deploy approvals", description: "Full demo: agent hits approval gate → you approve in this dashboard → agent retries and deploys.", href: "/docs/deploy-approvals" },
  { title: "SDK", description: "Node.js SDK for calling verify() before tool execution from any agent framework.", href: "/docs/sdk" },
  { title: "Webhooks", description: "Receive real-time signed events for allowed, denied, and approval-required decisions.", href: "/docs/webhooks" },
  { title: "Site Guard", description: "Block or allow AI agents and crawlers from accessing your website paths.", href: "/docs/site-guard" },
];

function DashboardDocs() {
  const { href: dHref } = useDashboardPaths();
  return (
    <>
      <Header title="Integration docs" description="Open implementation guides and API references." />
      <div className="dashboard-doc-cards">
        {DOC_CARDS.map((card) => (
          <Link key={card.href} href={dHref(card.href)} className="dashboard-doc-card">
            <strong className="dashboard-doc-card__title">{card.title}</strong>
            <p className="dashboard-doc-card__description">{card.description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}

function Header({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <PageHeader title={title} description={description} action={action} className="dashboard-header" />;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <StatCard label={label} value={value} />;
}

function Rows<T>({ items, href, title, meta }: { items: T[]; href: (item: T) => string; title: (item: T) => string; meta: (item: T) => string }) {
  if (!items.length) return <EmptyState className="dashboard-empty">Nothing here yet.</EmptyState>;
  return <div className="dashboard-list">{items.map((item) => <Link href={href(item)} key={href(item)}><span><strong>{title(item)}</strong><small>{meta(item)}</small></span></Link>)}</div>;
}

const APPROVAL_REQUIRED_REASON = "Permission requires approval before execution.";

function isApprovalRequired(log: Log) {
  return !log.allowed && (log.approvalRequired || log.reason === APPROVAL_REQUIRED_REASON);
}

function DenyReceipt({ log, onClose }: { log: Log; onClose: () => void }) {
  const approvalReq = isApprovalRequired(log);
  const decisionLabel = approvalReq ? "Approval Required" : "Denied";
  const [copied, setCopied] = useState(false);

  const receiptLines = [
    "Blocked Action",
    `Agent:      ${log.agentName || log.agentId}`,
    `Action:     ${log.action}`,
    ...(log.vendor ? [`Resource:   ${log.vendor}`] : []),
    `Decision:   ${decisionLabel}`,
    `Reason:     ${log.reason}`,
    `Risk:       ${log.risk}`,
    ...(log.permissionId ? [`Policy:     ${log.permissionId}`] : []),
    `Request ID: ${log.requestId}`,
    `Time:       ${log.createdAt ?? ""}`,
  ];
  const plainText = receiptLines.join("\n");
  const jsonText = JSON.stringify({
    decision: approvalReq ? "approval_required" : "denied",
    agent: log.agentName || log.agentId,
    action: log.action,
    resource: log.vendor ?? null,
    risk: log.risk,
    reason: log.reason,
    permissionId: log.permissionId ?? null,
    requestId: log.requestId,
    timestamp: log.createdAt ?? null,
  }, null, 2);

  const copy = async () => {
    await navigator.clipboard.writeText(plainText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="deny-receipt" role="region" aria-label="Deny receipt">
      <div className="deny-receipt__header">
        <span className={`console-status ${approvalReq ? "console-status--approval" : "console-status--denied"}`}>
          {decisionLabel}
        </span>
        <div className="deny-receipt__actions">
          <button className="deny-receipt__copy" type="button" onClick={copy}>
            {copied ? "Copied" : "Copy receipt"}
          </button>
          <button className="deny-receipt__close" type="button" onClick={onClose} aria-label="Close receipt">✕</button>
        </div>
      </div>
      <pre className="deny-receipt__body">{plainText}</pre>
      <details className="deny-receipt__json">
        <summary>JSON</summary>
        <pre>{jsonText}</pre>
      </details>
    </div>
  );
}

function LogList({ logs, approvalFilter }: { logs: Log[]; approvalFilter?: boolean }) {
  const [openReceipt, setOpenReceipt] = useState<string | null>(null);
  const filtered = approvalFilter ? logs.filter(isApprovalRequired) : logs;
  if (!filtered.length) return <EmptyState className="dashboard-empty">{approvalFilter ? "No approval-required decisions found." : "No logs yet."}</EmptyState>;
  return (
    <div className="dashboard-list dashboard-log-list">
      {filtered.map((log) => {
        const approvalReq = isApprovalRequired(log);
        const isDenied = !log.allowed;
        const showReceipt = openReceipt === log.requestId;
        return (
          <div key={log.requestId}>
            <span>
              <strong>{log.action}</strong>
              <small>{log.agentName || log.agentId} / {log.vendor || "no resource"}{typeof log.amount === "number" ? ` / $${log.amount}` : ""}</small>
              <small>{log.reason}</small>
              <small>{log.requestId}</small>
              {isDenied ? (
                <button
                  className="deny-receipt__toggle"
                  type="button"
                  onClick={() => setOpenReceipt(showReceipt ? null : log.requestId)}
                  aria-expanded={showReceipt}
                >
                  {showReceipt ? "Hide receipt" : "View receipt"}
                </button>
              ) : null}
            </span>
            {approvalReq
              ? <span className="console-status console-status--approval">approval required</span>
              : <span className={log.allowed ? "console-status console-status--allowed" : "console-status console-status--denied"}>{log.allowed ? "allowed" : "denied"}</span>}
            <span className={`console-status console-status--${log.risk}`}>{log.risk}</span>
            <span>{date(log.createdAt)}</span>
            {showReceipt ? <DenyReceipt log={log} onClose={() => setOpenReceipt(null)} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function LogSummaryStrip({ summary }: { summary: LogSummary }) {
  return (
    <section className="dashboard-metrics dashboard-log-summary" aria-label="Log summary">
      <Metric label="Total" value={summary.total} />
      <Metric label="Allowed" value={summary.allowed} />
      <Metric label="Denied" value={summary.denied} />
      <Metric label="High risk" value={summary.highRisk} />
      <Metric label="Approval required" value={summary.approvalRequired} />
      <Metric label="Top denied" value={summary.topDeniedAction ?? "None"} />
    </section>
  );
}

function Secret({ label, value }: { label: string; value: string }) {
  return <div className="secret-panel"><strong>{label}</strong><p>Shown once. Store it now.</p><code>{value}</code></div>;
}

function actionToPermTemplate(action: string): PermissionTemplate {
  if (action === "schedule") return "schedule";
  if (action === "purchase") return "purchase";
  if (["create_content", "send_email", "send_message"].includes(action)) return "create_content";
  if (!action) return "custom";
  return "access_data";
}

function buildVerifySnippet(agentId: string, permissions: Permission[] | undefined): string {
  const active = permissions?.find((p) => p.status === "active");
  const action = active?.action ?? "access_data";
  const vendor = active?.resource ?? active?.constraints?.allowedVendors?.[0] ?? "gmail.com";
  const scope = active?.allowedActions?.[0] ?? active?.scope ?? null;
  const metaBlock = scope ? `,\n  metadata: {\n    scope: "${scope}"\n  }` : "";
  return `import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
  baseUrl: "https://behalfid.com"
});

const result = await behalf.verify({
  agentId: "${agentId}",
  action: "${action}",
  vendor: "${vendor}"${metaBlock}
});`;
}

function dashboardPermissionSummary(permission: Permission) {
  const constraints = permission.constraints ?? {};
  const parts = [
    permission.resource ? `on ${permission.resource}` : null,
    permission.allowedActions?.length ? `allows: ${permission.allowedActions.join(", ")}` : (permission.scope ?? null),
    typeof constraints.maxAmount === "number" ? `max $${constraints.maxAmount}` : null,
    permission.requiresApproval ? "requires approval" : null,
    permission.blockedActions?.length ? `blocks: ${permission.blockedActions.join(", ")}` : null,
    constraints.expiresAt ? `expires ${date(constraints.expiresAt)}` : null,
    permission.status
  ].filter(Boolean);
  return parts.join(" / ") || permission.permissionId;
}
