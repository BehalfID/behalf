"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdaptiveDelegationConsole } from "@/components/dashboard/AdaptiveDelegationConsole";
import { OpsLogConsole } from "@/components/dashboard/OpsLogConsole";
import { PendingActionsQueue } from "@/components/dashboard/PendingActionsQueue";
import { DecisionIndicator } from "@/components/dashboard/OpsEventPrimitives";
import { FirstAgentSetup } from "@/components/dashboard/first-agent/FirstAgentSetup";
import { ManagedProfilesView } from "@/components/dashboard/ManagedProfilesView";
import { ManagedProfileActivityView } from "@/components/dashboard/ManagedProfileActivityView";
import { AccountDeletionSection } from "@/components/dashboard/AccountDeletionSection";
import { LinkedAccountsSection } from "@/components/dashboard/LinkedAccountsSection";
import { MfaSettingsSection } from "@/components/dashboard/MfaSettingsSection";
import { OpsInboxConsole } from "@/components/dashboard/OpsInboxConsole";
import { AgentDetailShell } from "@/components/dashboard/agent-detail/AgentDetailShell";
import type { AgentDetailSection } from "@/components/dashboard/agent-detail/types";
import {
  DeliveryStatusBadge,
  DestructiveSettingsSection,
  MemberRoleBadge,
  OperationsNavigation,
  SecretLifecycleNotice,
  SettingsNavigation,
  SettingsSection,
  SiteGuardStatus,
  WebhookStatusBadge
} from "@/components/dashboard/OperationsPrimitives";
import { AgentListTable } from "@/components/dashboard/agents/AgentManagement";
import {
  formatPauseApprovalDetails,
  formatPauseApprovalTitle,
  isManagedProfilePauseApproval,
} from "@/components/dashboard/opsLogTypes";
import { SessionInactivityMonitor } from "@/components/auth/SessionInactivityMonitor";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  CodeBlock,
  ConfirmDialog,
  DashboardState,
  PageHeader,
  PageLoadingState,
  RefreshingIndicator,
  RiskIndicator,
  SectionLoadingState,
  EmptyState
} from "@/components/ui";
import {
  CountedUsageLimitTile,
  InfoUsageLimitTile,
  WebhookUsageLimitTile
} from "@/components/usage/UsageLimitTile";
import { useDashboardApi, useDashboardPaths, useOptionalWorkspace } from "@/components/workspace/WorkspaceProvider";
import {
  buildSiteGuardCurlSnippet,
  buildSiteGuardEnvSnippet,
  buildSiteGuardExpressSnippet,
  buildSiteGuardNextjsSnippet,
} from "@/lib/siteGuardSnippets";
import {
  AGENT_TOOL_LABELS,
  AGENT_TOOLS,
  PRIMARY_GOAL_LABELS,
  PRIMARY_GOALS,
  type AgentTool
} from "@/lib/onboarding";
import {
  ProtectionPolicyEditor,
  protectionPolicyOrDefault
} from "@/components/protection/ProtectionPolicyEditor";
import { ProtectionSummary } from "@/components/protection/ProtectionSummary";
import { defaultProtectionPolicy, type ProtectionPolicy } from "@/lib/protectionPolicy";
import { summarizeProtectionPolicy } from "@/lib/protectionPolicyPermissions";
import type { WorkspaceProtectionStatus } from "@/lib/setupReadinessTypes";

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
  constraints?: {
    maxAmount?: number;
    allowedVendors?: string[];
    expiresAt?: string;
    allowedPaths?: string[];
    deniedPaths?: string[];
    deniedCommands?: string[];
  };
  requiredAuthorityLevel?: number;
  lastUsedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  replacesPermissionId?: string;
  replacedByPermissionId?: string;
  replacementIdempotencyKey?: string;
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
type Webhook = { webhookId: string; url: string; events: string[]; status: string; secretPreview: string; lastTriggeredAt?: string | null; createdAt?: string };
type Delivery = { deliveryId: string; eventType: string; eventId: string; status: string; httpStatus?: number; error?: string; attempt: number; nextRetryAt?: string | null; maxAttempts?: number; createdAt?: string };
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
  createdAt?: string;
};
type PendingInvite = {
  inviteId: string;
  email: string;
  role: string;
  status: "pending";
  acceptUrl?: string | null;
  createdAt?: string;
};
type MembersResponse = {
  members: AccountMember[];
  pendingInvites: PendingInvite[];
  canManageMembers: boolean;
  workspaceAuthority?: WorkspaceAuthority | null;
};
type DashboardResource<T> = {
  data: T | null;
  error: string;
  loading: boolean;
  refreshing: boolean;
  reload: () => Promise<void>;
};
type AgentProvider = "custom" | "ollie" | "chatgpt" | "claude" | "gemini" | "zapier" | "make" | "langchain" | "openai" | "ollama" | "other";
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
type OnboardingUseCase = "personal" | "website" | "sdk";




const FIRST_AGENT_EXAMPLES = [
  { title: "Coding agent", body: "Allow staging deploys. Require approval before production. Deny secret access and destructive repo actions." },
  { title: "Research agent", body: "Allow web research and public page reads. Deny checkout, forms, and account access." },
  { title: "Shopping agent", body: "Allow product comparison. Allow purchases only under $25 from approved vendors." }
];

// Kept for the existing onboarding content model; unrelated to the agent-detail extraction.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    actionHref: "/dashboard/agents/new",
    steps: [
      { title: "Choose assistant", body: "Pick ChatGPT, Claude, Gemini, Ollama, Ollie, Zapier, Make, or another tool.", href: "/dashboard/agents/new" },
      { title: "Describe the job", body: "State what it can do, what it must not do, and any spending or vendor limits.", href: "/dashboard/agents/new" },
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
      { title: "Create site agent", body: "Represent the agent or gateway that will check requests before site actions execute.", href: "/dashboard/agents/new" },
      { title: "Define site rules", body: "Set resources, blocked actions, approval needs, and limits for risky workflows.", href: "/dashboard/agents" },
      { title: "Review events", body: "Use logs and webhooks to inspect allowed, denied, and failed decisions.", href: "/dashboard/logs" }
    ]
  },
  sdk: {
    kicker: "SDK developer path",
    title: "Create a guarded agent and verify its first test action.",
    body: "Get to the core loop quickly: create an agent, define a boundary, call verify(), and inspect the audit event.",
    actionLabel: "Add agent",
    actionHref: "/dashboard/agents/new",
    steps: [
      { title: "Add agent", body: "Create a native identity and store the one-time API key in your environment.", href: "/dashboard/agents/new" },
      { title: "Create permission", body: "Define the action, resource, spending limit, expiration, and approval requirement.", href: "/dashboard/agents" },
      { title: "Install SDK", body: "Use @behalfid/sdk from Node 18+ and call verify before tool execution.", href: "/docs/sdk" },
      { title: "Verify before acting", body: "Fail closed on denied decisions and use request IDs for debugging.", href: "/dashboard/docs" }
    ]
  }
};

function useResource<T>(path: string) {
  const { apiJson, workspaceSlug } = useDashboardApi();
  const key = `${workspaceSlug ?? "legacy"}:${path}`;
  const requestId = useRef(0);
  const [state, setState] = useState<{
    key: string;
    data: T | null;
    error: string;
    loading: boolean;
  }>({ key, data: null, error: "", loading: true });

  const current = state.key === key
    ? state
    : { key, data: null, error: "", loading: true };

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setState((previous) => ({
      key,
      data: previous.key === key ? previous.data : null,
      error: "",
      loading: true
    }));
    try {
      const data = await apiJson<T>(path);
      if (requestId.current === id) setState({ key, data, error: "", loading: false });
    } catch (requestError) {
      if (requestId.current !== id) return;
      setState((previous) => ({
        key,
        data: previous.key === key ? previous.data : null,
        error: requestError instanceof Error ? requestError.message : "Request failed.",
        loading: false
      }));
    }
  }, [apiJson, key, path]);

  useEffect(() => {
    let cancelled = false;
    const id = ++requestId.current;
    async function load() {
      setState({ key, data: null, error: "", loading: true });
      try {
        const result = await apiJson<T>(path);
        if (!cancelled && requestId.current === id) {
          setState({ key, data: result, error: "", loading: false });
        }
      } catch (requestError) {
        if (!cancelled && requestId.current === id) {
          setState({
            key,
            data: null,
            error: requestError instanceof Error ? requestError.message : "Request failed.",
            loading: false
          });
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
      if (requestId.current === id) requestId.current += 1;
    };
  }, [apiJson, key, path]);

  return {
    data: current.data,
    error: current.error,
    loading: current.loading,
    refreshing: current.loading && Boolean(current.data),
    reload
  };
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
  agentSection = "overview",
  emailVerified = true,
  showSetupBanner = false
}: {
  view: "home" | "first-agent" | "agents" | "agent" | "sites" | "webhooks" | "webhook" | "logs" | "approvals" | "inbox" | "docs" | "settings" | "managed-profiles" | "managed-profiles-activity" | "adaptive-delegation";
  id?: string;
  agentSection?: AgentDetailSection;
  emailVerified?: boolean;
  showSetupBanner?: boolean;
}) {
  const workspaceSlug = useOptionalWorkspace()?.workspaceSlug ?? "legacy";
  const contentKey = `${workspaceSlug}:${view}:${id ?? ""}`;
  return (
    <Fragment key={contentKey}>
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
        {view === "first-agent" ? <FirstAgentSetupView emailVerified={emailVerified} /> : null}
        {view === "agents" ? <AgentsView /> : null}
        {view === "agent" && id ? <AgentDetailShell agentId={id} section={agentSection} /> : null}
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
        {view === "adaptive-delegation" ? <AdaptiveDelegationConsole /> : null}
    </Fragment>
  );
}

export function DashboardShell({
  view,
  id,
  agentSection = "overview",
  emailVerified = true,
  showSetupBanner = false
}: {
  view: "home" | "first-agent" | "agents" | "agent" | "sites" | "webhooks" | "webhook" | "logs" | "approvals" | "inbox" | "docs" | "settings" | "managed-profiles" | "managed-profiles-activity" | "adaptive-delegation";
  id?: string;
  agentSection?: AgentDetailSection;
  emailVerified?: boolean;
  showSetupBanner?: boolean;
}) {
  return (
    <>
      <SessionInactivityMonitor />
      <DashboardViews
        view={view}
        id={id}
        agentSection={agentSection}
        emailVerified={emailVerified}
        showSetupBanner={showSetupBanner}
      />
    </>
  );
}


function feedTime(value?: string) {
  if (!value) return "â€”";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "â€”";
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function FirstAgentSetupView({ emailVerified }: { emailVerified: boolean }) {
  return (
    <Suspense fallback={<PageLoadingState label="Loading agent setup" variant="form" />}>
      <FirstAgentSetupViewInner emailVerified={emailVerified} />
    </Suspense>
  );
}

function FirstAgentSetupViewInner({ emailVerified }: { emailVerified: boolean }) {
  const searchParams = useSearchParams();
  const summary = useResource<{
    accountOnboarding?: {
      agentTools?: AgentTool[];
      protectionPolicy?: ProtectionPolicy | null;
    } | null;
  }>("/api/dashboard/summary");
  const suggestedSurfaces = summary.data?.accountOnboarding?.agentTools ?? [];
  const workspacePolicy = summary.data?.accountOnboarding?.protectionPolicy ?? null;
  const focus = searchParams.get("focus");
  if (summary.loading && !summary.data) {
    return <PageLoadingState label="Loading agent setup" variant="form" />;
  }
  return (
    <FirstAgentSetup
      emailVerified={emailVerified}
      focus={focus}
      suggestedSurfaces={suggestedSurfaces}
      workspacePolicy={workspacePolicy}
    />
  );
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
      protectionPolicy?: ProtectionPolicy | null;
    } | null;
    usage: UsageSummary;
  }>("/api/dashboard/summary");
  const inbox = useResource<{ pendingApprovals: ApprovalRequest[]; deniedHighRisk: Log[] }>("/api/dashboard/inbox");
  const protection = useResource<{ surfaces: WorkspaceProtectionStatus[] }>("/api/dashboard/protection-status");
  const activity = useResource<{ logs: Log[] }>("/api/dashboard/logs?limit=8");

  const initialLoading = [summary, inbox, activity].some((resource) => resource.loading && !resource.data);
  if (initialLoading) {
    return <PageLoadingState label="Loading workspace overview" variant="overview" />;
  }

  const hasAgents = (summary.data?.totalAgents ?? 0) > 0;
  const protectionPolicy = summary.data?.accountOnboarding?.protectionPolicy ?? null;
  const policySummary = protectionPolicy ? summarizeProtectionPolicy(protectionPolicy) : null;
  const policyRows = policySummary
    ? [
        ...policySummary.blocked.map((entry) => ({
          label: entry.label,
          state: "Blocked",
          tone: "deny" as const
        })),
        ...policySummary.approval.map((entry) => ({
          label: entry.label,
          state: "Needs approval",
          tone: "warn" as const
        })),
        ...policySummary.allowed.map((entry) => ({
          label: entry.label,
          state: "Automatic",
          tone: "ok" as const
        }))
      ]
    : [];
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
    : { label: summary.error ? "Unavailable" : "Loading", tone: "idle" as const };

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

  const headerAction = !summary.data
    ? { label: "Manage agents", href: dHref("/dashboard/agents") }
    : !hasAgents
    ? { label: "Set up first agent", href: dHref("/dashboard/agents/new") }
    : pendingApprovals.length > 0
      ? { label: "Review approvals", href: dHref("/dashboard/approvals") }
      : firstSetupGoal === "setup_deploy_approvals"
        ? { label: "Configure deploy approvals", href: dHref("/dashboard/agents/new?focus=production_deploys") }
        : { label: "Add agent", href: dHref("/dashboard/agents/new") };

  return (
    <>
      <Header
        eyebrow="Workspace overview"
        title="Control plane"
        description="Current state of agents, policies, and decisions in this workspace."
        action={<ButtonLink variant="primary" href={headerAction.href}>{headerAction.label}</ButtonLink>}
        status={
          <Badge variant={systemState.tone === "ok" ? "success" : systemState.tone === "warn" ? "warning" : "outline"}>
            {systemState.label}
          </Badge>
        }
      />
      {summary.refreshing || inbox.refreshing || activity.refreshing ? (
        <RefreshingIndicator label="Refreshing workspace overview" />
      ) : null}
      {summary.error ? (
        <Alert tone="destructive">Overview metrics could not be {summary.data ? "refreshed" : "loaded"}: {summary.error}</Alert>
      ) : null}

      <section className="ops-strip" aria-label="System status">
        <div className="ops-strip__state">
          <span className={`cx-dot${systemState.tone === "warn" ? " cx-dot--warn" : systemState.tone === "idle" ? " cx-dot--idle" : ""}`} aria-hidden="true" />
          {systemState.label}
        </div>
        <dl className="ops-strip__seg">
          <dt>Agents</dt>
          <dd>{summary.data?.totalAgents ?? "â€”"}</dd>
        </dl>
        <dl className="ops-strip__seg">
          <dt>Permissions</dt>
          <dd>{summary.data?.activePermissions ?? "â€”"}</dd>
        </dl>
        <dl className={`ops-strip__seg${pendingApprovals.length > 0 ? " ops-strip__seg--alert" : ""}`}>
          <dt>Pending approvals</dt>
          <dd>{inbox.data ? pendingApprovals.length : "â€”"}</dd>
        </dl>
        <dl className="ops-strip__seg">
          <dt>Decisions today</dt>
          <dd>{summary.data?.logsToday ?? "â€”"}</dd>
        </dl>
        <div className="ops-strip__spacer" aria-hidden="true" />
        <Link className="ops-strip__link" href={dHref("/dashboard/logs")}>Audit log â†’</Link>
      </section>

      <div className="ops-grid">
        <div className="ops-col">
          <section className="ops-panel" aria-label="Approval queue">
            <div className="ops-panel__head">
              <p className="cx-label">Approval queue</p>
              <Link href={dHref("/dashboard/approvals")}>Open queue</Link>
            </div>
            {inbox.error && !inbox.data ? (
              <p className="ops-empty" role="alert">Approval queue unavailable: {inbox.error}</p>
            ) : !inbox.data ? (
              <p className="ops-empty">Approval queue unavailable.</p>
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
                          : `${item.agentName ?? item.agentId} Â· ${item.action}`}
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
            {activity.error && !activity.data ? (
              <p className="ops-empty" role="alert">Recent activity unavailable: {activity.error}</p>
            ) : !activity.data ? (
              <p className="ops-empty">Recent activity unavailable.</p>
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
                      <span className="ops-feed__title">{log.agentName ?? log.agentId} Â· <code>{log.action}</code></span>
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
            {summary.error && !summary.data ? (
              <p className="ops-empty" role="alert">Policy coverage could not be loaded.</p>
            ) : !protectionPolicy ? (
              <p className="ops-empty">No protection policy chosen yet. Set one up to see coverage here.</p>
            ) : (
              <div className="ops-coverage">
                {policyRows.map((row) => (
                  <Link className="ops-coverage__row" href={dHref("/dashboard/settings")} key={row.label}>
                    <span>{row.label}</span>
                    <span className={`cx-chip cx-chip--${row.tone}`}>{row.state}</span>
                  </Link>
                ))}
              </div>
            )}
            {protectionPolicy ? (
              <div className="ops-panel__foot">
                {hasAgents
                  ? "Your workspace default. Each agent keeps the permissions it was given — open the agent to change them."
                  : "Your workspace default. It becomes real permissions on the first agent you create."}
              </div>
            ) : null}
          </section>

          <section className="ops-panel" aria-label="What is protected">
            <div className="ops-panel__head">
              <p className="cx-label">What is protected</p>
            </div>
            {protection.error && !protection.data ? (
              <p className="ops-empty" role="alert">Protection status could not be loaded.</p>
            ) : (
              <div className="ops-coverage">
                {(protection.data?.surfaces ?? []).map((surface) => (
                  <Link
                    className="ops-coverage__row"
                    href={dHref(surface.active ? "/dashboard/logs" : "/dashboard/agents/new")}
                    key={surface.surface}
                    title={surface.hint}
                  >
                    <span>{surface.label}</span>
                    <span className={`cx-chip${surface.active ? " cx-chip--ok" : ""}`}>
                      {surface.active ? "Protected" : "Not connected"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <div className="ops-panel__foot">
              A surface counts as protected only once BehalfID has decided a real action for it.
            </div>
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
                    <span className="ops-next__arrow" aria-hidden="true">â†’</span>
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
  if (resource.loading && !resource.data) {
    return <PageLoadingState label="Loading agents" variant="table" />;
  }
  return (
    <>
      <Header
        action={<ButtonLink variant="primary" href={dHref("/dashboard/agents/new")}>Add agent</ButtonLink>}
        description="Manage the identities BehalfID evaluates before an agent can act in this workspace."
        eyebrow="Agents & access"
        title="Agents"
      /> {/* pragma: allowlist secret */}
      {resource.refreshing ? <RefreshingIndicator label="Refreshing agents" /> : null}
      {resource.error && !resource.data ? <DashboardState kind="error" title="Agents could not be loaded" description={resource.error} /> : null}
      {resource.error && resource.data ? <Alert tone="destructive">Agents could not be refreshed: {resource.error}</Alert> : null}
      {!agents.length && resource.data ? (
        <section className="agents-empty">
          <DashboardState
            action={<ButtonLink variant="primary" href={dHref("/dashboard/agents/new")}>Set up your first agent</ButtonLink>}
            description="Register an agent identity, store its one-time credential, and attach a narrow permission policy before the first action is verified."
            kind="empty"
            title="No agents in this workspace"
          />
          <div className="agents-empty__examples" aria-label="Common agent policy examples">
            <p>Common starting points</p>
            {FIRST_AGENT_EXAMPLES.map((example) => (
              <div key={example.title}>
                <strong>{example.title}</strong>
                <span>{example.body}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {agents.length > 0 ? (
        <section className="agents-index" aria-label="Workspace agents">
          <div className="agents-index__context">
            <p><strong>Identity comes first.</strong> Open an agent to review its credential state, exact permission constraints, integrations, and verification activity.</p>
            <span className="agents-index__count">{agents.length} {agents.length === 1 ? "agent" : "agents"}</span>
          </div>
          <AgentListTable
            agents={agents}
            hrefForAgent={(agent) => dHref(`/dashboard/agents/${agent.agentId}`)}
          />
        </section>
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
  const [creatingSite, setCreatingSite] = useState(false);
  const selectedSiteId = siteId || sites[0]?.siteId || "";

  const createSite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingSite(true);
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
    } finally {
      setCreatingSite(false);
    }
  };

  if (resource.loading && !resource.data) {
    return <PageLoadingState label="Loading Site Guard" variant="settings" />;
  }

  return (
    <>
      <Header
        eyebrow="Workspace administration"
        title="Site Guard"
        description="Enforce server-side route policy for identified AI agents before protected content is served."
        action={<ButtonLink href="/docs/site-guard">Integration docs</ButtonLink>}
      />
      <OperationsNavigation current="site-guard" />
      {resource.refreshing ? <RefreshingIndicator label="Refreshing Site Guard" /> : null}
      {resource.error && !resource.data ? <DashboardState kind="error" title="Site Guard could not be loaded" description={resource.error} /> : null}
      {resource.error && resource.data ? <Alert tone="destructive">Site Guard could not be refreshed: {resource.error}</Alert> : null}
      {siteError ? <p className="form-error" role="alert">{siteError}</p> : null}
      {resource.data ? (
        <>
          <section className="site-guard-intro" aria-label="Site Guard enforcement model">
            <div><strong>Server-side boundary</strong><p>Call Site Guard before returning a protected route. Site keys must never enter client code.</p></div>
            <div><strong>Deny by default</strong><p>A path is allowed only when an active rule matches the agent signal and explicitly allows it.</p></div>
            <div><strong>Fail closed</strong><p>Missing sites, disabled sites, required approvals, lookup failures, and unmatched rules deny access.</p></div>
          </section>
          <div className="site-guard-master">
            <SettingsSection
              id="site-guard-sites"
              eyebrow="Protected resources"
              title="Sites"
              description="Choose a configured domain or register another server-side enforcement boundary."
            >
              <div className="site-directory">
                {sites.map((site) => (
                  <button
                    aria-pressed={selectedSiteId === site.siteId}
                    className="site-directory__row"
                    key={site.siteId}
                    onClick={() => setSiteId(site.siteId)}
                    type="button"
                  >
                    <span>
                      <strong>{site.name}</strong>
                      <small>{site.domain}</small>
                    </span>
                    <SiteGuardStatus status={site.status} />
                  </button>
                ))}
              </div>
              {!sites.length ? (
                <DashboardState
                  className="dashboard-empty"
                  kind="empty"
                  title="No Site Guard sites"
                  description="Register a domain to create its server-side route policy boundary."
                />
              ) : null}
              <div className="settings-subsection">
                <h3>Register a site</h3>
                <p>The domain identifies the protected site; route enforcement begins when your server calls the Site Guard check endpoint.</p>
                <form className="operations-form-grid" onSubmit={createSite}>
                  <label><span>Name</span><input onChange={(event) => setName(event.target.value)} placeholder="Docs site" required value={name} /></label>
                  <label><span>Domain</span><input inputMode="url" onChange={(event) => setDomain(event.target.value)} placeholder="docs.example.com" required value={domain} /></label>
                  <div className="setup-actions"><Button loading={creatingSite} variant="primary" type="submit">Create site</Button></div>
                </form>
              </div>
            </SettingsSection>
            <div className="site-guard-detail">
              {selectedSiteId ? <SiteDetailView siteId={selectedSiteId} onChanged={resource.reload} /> : null}
            </div>
          </div>
        </>
      ) : null}
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
  const [detailWorking, setDetailWorking] = useState<string | null>(null);

  const createRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDetailWorking("create-rule");
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
    } finally {
      setDetailWorking(null);
    }
  };

  const createKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDetailWorking("create-key");
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
    } finally {
      setDetailWorking(null);
    }
  };

  const revokeKey = async (keyId: string) => {
    setDetailWorking(`key:${keyId}`);
    try {
      setKeyError("");
      await api(`/api/dashboard/sites/${siteId}/keys/${keyId}`, { method: "DELETE" });
      if (newKeyData?.keyId === keyId) setNewKeyData(null);
      await detail.reload();
    } catch (requestError) {
      setKeyError(requestError instanceof Error ? requestError.message : "Key revocation failed.");
    } finally {
      setDetailWorking(null);
    }
  };

  const setSiteStatus = async (status: Site["status"]) => {
    setDetailWorking("site-status");
    try {
      setDetailError("");
      await api(`/api/dashboard/sites/${siteId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await Promise.all([detail.reload(), onChanged()]);
    } catch (requestError) {
      setDetailError(requestError instanceof Error ? requestError.message : "Site status update failed.");
    } finally {
      setDetailWorking(null);
    }
  };

  const setRuleStatus = async (rule: SiteRule) => {
    setDetailWorking(`rule:${rule.ruleId}`);
    try {
      setDetailError("");
      await api(`/api/dashboard/sites/${siteId}/rules/${rule.ruleId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: rule.status === "active" ? "disabled" : "active" })
      });
      await detail.reload();
    } catch (requestError) {
      setDetailError(requestError instanceof Error ? requestError.message : "Rule status update failed.");
    } finally {
      setDetailWorking(null);
    }
  };

  if (detail.error && !detail.data) return <DashboardState kind="error" title="Site configuration could not be loaded" description={detail.error} />;
  const site = detail.data?.site;
  if (!site) return <SectionLoadingState label="Loading site configuration" rows={6} />;

  const hasKeys = (detail.data?.keys ?? []).some((k) => k.status === "active");

  return (
    <>
      {detail.refreshing ? <RefreshingIndicator label="Refreshing site configuration" /> : null}
      {detail.error ? <Alert tone="destructive">Site configuration could not be refreshed: {detail.error}</Alert> : null}
      <div className="site-guard-detail__header">
        <div>
          <SiteGuardStatus status={site.status} />
          <h2>{site.name}</h2>
          <code>{site.domain} Â· {site.siteId}</code>
        </div>
        {site.status === "disabled" ? (
          <Button
            loading={detailWorking === "site-status"}
            onClick={() => void setSiteStatus("active")}
            variant="primary"
          >
            Enable site
          </Button>
        ) : (
          <ConfirmDialog
            confirmLabel="Disable site"
            confirmVariant="danger"
            description="Site Guard checks for this site are denied until the site is enabled again."
            loading={detailWorking === "site-status"}
            onConfirm={() => setSiteStatus("disabled")}
            title={`Disable ${site.name}?`}
            trigger={(open) => (
              <Button
                loading={detailWorking === "site-status"}
                onClick={open}
                type="button"
                variant="danger"
              >
                Disable site
              </Button>
            )}
          />
        )}
      </div>
      {site.status === "disabled" ? (
        <div className="operations-notice operations-notice--danger" role="status">
          <strong>This site is disabled.</strong>
          Site Guard checks for this site are denied until the site is enabled again.
        </div>
      ) : null}
      {detailError ? <p className="form-error" role="alert">{detailError}</p> : null}
      <div className="site-guard-tabs">
        <section className="site-guard-group" aria-labelledby={`site-keys-${site.siteId}`}>
          <div className="site-guard-group__header">
            <div>
              <h3 id={`site-keys-${site.siteId}`}>Site keys</h3>
              <p>Server-only credentials scoped to this site. The raw key is available only at creation.</p>
            </div>
            <Badge variant={hasKeys ? "success" : "warning"}>{hasKeys ? "Key ready" : "Key required"}</Badge>
          </div>
          {keyError ? <p className="form-error" role="alert">{keyError}</p> : null}
          {newKeyData ? (
            <>
              <SecretLifecycleNotice
                description="Copy this server-only key now. BehalfID stores only its hash, so it cannot be recovered after you dismiss it."
                label="Site key created"
                value={newKeyData.rawKey}
              />
              <div className="setup-actions"><Button onClick={() => setNewKeyData(null)} size="small" type="button">Dismiss key</Button></div>
            </>
          ) : null}
          <div className="site-guard-list">
            {(detail.data?.keys ?? []).map((key) => (
              <div className="site-guard-row" key={key.keyId}>
                <div className="site-guard-row__identity">
                  <strong>{key.name}</strong>
                  <div className="site-guard-row__meta">
                    <span><code>{key.keyPreview}</code></span>
                    <span>{key.status === "active" && key.lastUsedAt ? `Last used ${date(key.lastUsedAt)}` : "Never used"}</span>
                    <span>Created {date(key.createdAt)}</span>
                  </div>
                </div>
                <div className="site-guard-row__actions">
                  <Badge variant={key.status === "active" ? "success" : "outline"}>{key.status}</Badge>
                  {key.status === "active" ? (
                    <ConfirmDialog
                      confirmLabel="Revoke key"
                      confirmVariant="danger"
                      description="This site key stops authenticating Site Guard checks immediately. Create a new key if you still need access."
                      loading={detailWorking === `key:${key.keyId}`}
                      onConfirm={() => revokeKey(key.keyId)}
                      title={`Revoke ${key.name}?`}
                      trigger={(open) => (
                        <Button loading={detailWorking === `key:${key.keyId}`} onClick={open} size="small" type="button" variant="danger">
                          Revoke
                        </Button>
                      )}
                    >
                      <p>Key preview: <code>{key.keyPreview}</code></p>
                    </ConfirmDialog>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {!(detail.data?.keys ?? []).length ? <DashboardState className="dashboard-empty" kind="empty" title="No site keys" description="Create a server-only key before integrating this site." /> : null}
        </section>

        <section className="site-guard-group" aria-labelledby={`site-rules-${site.siteId}`}>
          <div className="site-guard-group__header">
            <div>
              <h3 id={`site-rules-${site.siteId}`}>Route rules</h3>
              <p>Rules match an agent signal, block listed paths first, and allow only explicitly listed paths.</p>
            </div>
            <Badge variant="outline">{detail.data?.rules.length ?? 0} configured</Badge>
          </div>
          <div className="site-guard-list">
            {detail.data?.rules.map((rule) => (
              <div className="site-guard-row" key={rule.ruleId}>
                <div className="site-guard-row__identity">
                  <strong>{rule.name}</strong>
                  <div className="site-guard-row__meta">
                    <span>Signal <code>{rule.agentIdentifier || rule.userAgentPattern}</code></span>
                    <span>{rule.requiresApproval ? "Approval required" : "Direct decision"}</span>
                  </div>
                  <div className="site-guard-row__details">
                    <div className="site-path-list" aria-label="Allowed paths">
                      <span className="sr-only">Allowed paths:</span>
                      {rule.allowedPaths.length ? rule.allowedPaths.map((path) => <code key={`allow-${path}`}>allow {path}</code>) : <code>allow none</code>}
                    </div>
                    <div className="site-path-list" aria-label="Blocked paths">
                      <span className="sr-only">Blocked paths:</span>
                      {rule.blockedPaths.length ? rule.blockedPaths.map((path) => <code key={`block-${path}`}>block {path}</code>) : <code>block none</code>}
                    </div>
                  </div>
                </div>
                <div className="site-guard-row__actions">
                  <Badge variant={rule.status === "active" ? "success" : "outline"}>{rule.status}</Badge>
                  <Button loading={detailWorking === `rule:${rule.ruleId}`} onClick={() => void setRuleStatus(rule)} size="small">{rule.status === "active" ? "Disable" : "Enable"}</Button>
                </div>
              </div>
            ))}
          </div>
          {!(detail.data?.rules ?? []).length ? <DashboardState className="dashboard-empty" kind="empty" title="No route rules" description="Without an active matching rule, Site Guard denies access." /> : null}
        </section>

        <section className="site-guard-group" aria-labelledby={`site-checks-${site.siteId}`}>
          <div className="site-guard-group__header">
            <div>
              <h3 id={`site-checks-${site.siteId}`}>Recent checks</h3>
              <p>The latest 25 recorded decisions for this site. This view does not imply continuous health monitoring.</p>
            </div>
          </div>
          <div className="site-guard-list">
            {detail.data?.logs.map((log) => (
              <div className="site-guard-row" key={log.requestId}>
                <div className="site-guard-row__identity">
                  <div className="site-guard-check__decision">
                    <Badge variant={log.allowed ? "success" : "destructive"}>{log.allowed ? "Allowed" : "Denied"}</Badge>
                    <strong><code>{log.path}</code></strong>
                  </div>
                  <div className="site-guard-row__meta">
                    <span>{log.reason}</span>
                    <span><code>{log.requestId}</code></span>
                    <span>{date(log.createdAt)}</span>
                  </div>
                </div>
                <Badge variant={log.risk === "high" ? "destructive" : log.risk === "medium" ? "warning" : "success"}>{log.risk} risk</Badge>
              </div>
            ))}
          </div>
          {!(detail.data?.logs ?? []).length ? <DashboardState className="dashboard-empty" kind="empty" title="No checks recorded" description="Decisions appear after your server calls Site Guard for this site." /> : null}
        </section>
      </div>

      <div className="site-guard-side-forms">
        <SettingsSection id={`create-site-key-${site.siteId}`} eyebrow="Developer access" title="Create site key" description="Name the server or environment that will hold this credential.">
          <form className="operations-form-grid" onSubmit={createKey}>
            <label className="operations-form-grid__wide"><span>Key name</span><input maxLength={120} onChange={(event) => setKeyName(event.target.value)} placeholder="Production middleware" required value={keyName} /></label>
            <div className="setup-actions"><Button loading={detailWorking === "create-key"} variant="primary" type="submit">Create key</Button></div>
          </form>
        </SettingsSection>
        <SettingsSection id={`create-site-rule-${site.siteId}`} eyebrow="Enforcement" title="Add route rule" description="Identify the agent, then declare the absolute paths this rule allows or blocks.">
          <form className="operations-form-grid" onSubmit={createRule}>
            <label><span>Rule name</span><input onChange={(event) => setName(event.target.value)} required value={name} /></label>
            <label><span>Agent identifier</span><input onChange={(event) => setSignal(event.target.value)} placeholder="crawler_alpha" value={signal} /></label>
            <label><span>User-Agent pattern</span><input onChange={(event) => setPattern(event.target.value)} placeholder="ExampleBot/*" value={pattern} /></label>
            <label><span>Allowed paths</span><textarea onChange={(event) => setAllowedPaths(event.target.value)} rows={3} value={allowedPaths} /><small className="field-help">Comma- or line-separated absolute path globs.</small></label>
            <label><span>Blocked paths</span><textarea onChange={(event) => setBlockedPaths(event.target.value)} rows={3} value={blockedPaths} /><small className="field-help">Blocked paths take precedence over allowed paths.</small></label>
            <label className="setup-check setup-check--setting operations-form-grid__wide"><input checked={requiresApproval} onChange={(event) => setRequiresApproval(event.target.checked)} type="checkbox" /><span className="setup-check__body"><span className="setup-check__label">Require approval</span><span className="setup-check__hint">Matching allowed paths remain denied until approval is available.</span></span></label>
            <div className="setup-actions"><Button loading={detailWorking === "create-rule"} variant="primary" type="submit">Add rule</Button></div>
          </form>
        </SettingsSection>
      </div>
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
    <SettingsSection
      action={<ButtonLink href="/docs/site-guard">Docs</ButtonLink>}
      className="site-guard-integration"
      description="Call the check endpoint from server middleware before returning a route that Site Guard governs."
      eyebrow={`${site.name} Â· ${site.domain}`}
      id={`site-integration-${site.siteId}`}
      title="Integrate this site"
    >
      <div className="operations-notice operations-notice--warning">
        <strong>Never expose <code>SITE_GUARD_KEY</code> in browser or client code.</strong>
        {" "}Site keys are server-side only. Do not include them in client bundles, environment
        variables visible to the browser, or any response sent to end users or crawlers.
      </div>

      {!hasKeys ? (
        <div className="operations-notice">
          <strong>Create a site key to use these snippets.</strong>
          <p className="field-help">
            Create a key using the form above. Copy it immediately after creation â€” it will not
            be shown again. Store it as <code>SITE_GUARD_KEY</code> in your server environment or
            secret manager.
          </p>
        </div>
      ) : null}

      <div className="site-guard-integration__steps">
        <div className="site-guard-integration__step">
          <h3>Add the server environment variable</h3>
          <p className="field-help">
            {rawKey
              ? "Your new key is included below. Copy it before dismissing the one-time key notice."
              : "Create a site key above, copy it immediately, then add it to your server environment."}
          </p>
          <CodeBlock label=".env">{envSnippet}</CodeBlock>
        </div>

        <div className="site-guard-integration__step">
          <h3>Test the enforcement decision</h3>
          <p className="field-help">Set <code>SITE_GUARD_KEY</code> in your shell, then confirm the endpoint returns the expected allow or deny decision.</p>
          <CodeBlock label="terminal">{curlSnippet}</CodeBlock>
        </div>

        <div className="site-guard-integration__step">
          <h3>Add server middleware</h3>
          <p className="field-help">Choose the implementation that matches the protected application. Both examples deny on a failed check.</p>
          <CodeBlock label="middleware.ts">{nextjsSnippet}</CodeBlock>
          <div className="site-guard-integration__code-spacer" />
          <CodeBlock label="src/siteGuard.ts">{expressSnippet}</CodeBlock>
        </div>
      </div>

      <p className="field-help" style={{ marginTop: 16 }}>
        <Link href="/docs/site-guard">Site Guard docs</Link>
        {" Â· "}
        Full examples: <code>examples/site-guard-nextjs</code>, <code>examples/site-guard-express</code>
      </p>
    </SettingsSection>
  );
}

function WebhooksView() {
  const { apiJson: api } = useDashboardApi();
  const { href: dHref } = useDashboardPaths();
  const resource = useResource<{ webhooks: Webhook[]; eventTypes: string[]; plan: Plan; webhooksEnabled: boolean; upgradeHint: string | null }>("/api/dashboard/webhooks");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [webhookError, setWebhookError] = useState("");
  const [creating, setCreating] = useState(false);
  const events = useMemo(() => ["verification.allowed", "verification.denied", "agent.key_rotated", "permission.revoked"], []);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    setWebhookError("");
    setCreating(true);
    try {
      const result = await api<{ secret: string }>("/api/dashboard/webhooks", { method: "POST", body: JSON.stringify({ url, events }) });
      setSecret(result.secret);
      setUrl("");
      await resource.reload();
    } catch (err) {
      setWebhookError(err instanceof Error ? err.message : "Webhook creation failed.");
    } finally {
      setCreating(false);
    }
  };
  const webhooksEnabled = resource.data?.webhooksEnabled ?? false;
  if (resource.loading && !resource.data) {
    return <PageLoadingState label="Loading webhooks" variant="table" />;
  }
  return (
    <>
      <Header
        eyebrow="Workspace administration"
        title="Webhooks"
        description="Deliver signed workspace events to endpoints you operate."
        action={webhooksEnabled ? <ButtonLink variant="secondary" href={dHref("/dashboard/billing")}>Manage billing</ButtonLink> : undefined}
      />
      <OperationsNavigation current="webhooks" />
      {resource.refreshing ? <RefreshingIndicator label="Refreshing webhooks" /> : null}
      {resource.error && !resource.data ? <DashboardState kind="error" title="Webhooks could not be loaded" description={resource.error} /> : null}
      {resource.error && resource.data ? <Alert tone="destructive">Webhooks could not be refreshed: {resource.error}</Alert> : null}
      {resource.data ? (
        <>
          {!webhooksEnabled ? (
            <SettingsSection
              action={<ButtonLink variant="primary" href={dHref("/dashboard/billing")}>Upgrade to Pro</ButtonLink>}
              className="webhook-gate-card"
              description="Endpoint creation and delivery are unavailable on the current plan. Existing endpoint records remain visible below."
              eyebrow={`${resource.data.plan.charAt(0).toUpperCase()}${resource.data.plan.slice(1)} plan`}
              id="webhook-plan-access"
              title="Webhook delivery is not included"
              tone="restricted"
            >
              <div className="operations-notice operations-notice--warning">
                <strong>{resource.data.upgradeHint ?? "Upgrade to enable webhook delivery."}</strong>
                Verification continues independently; this plan gate does not change verification decisions.
              </div>
            </SettingsSection>
          ) : null}

          <SettingsSection
            description="The signing secret proves that a request came from BehalfID. This dashboard flow subscribes new endpoints to the four events shown here."
            eyebrow="Endpoint configuration"
            id="create-webhook"
            title="Create webhook"
            tone={webhooksEnabled ? "default" : "restricted"}
          >
            <div className="webhook-create-layout">
              <form className="operations-form-grid" onSubmit={create}>
                <label className="operations-form-grid__wide">
                  <span>Endpoint URL</span>
                  <input autoCapitalize="none" autoCorrect="off" disabled={!webhooksEnabled || creating} inputMode="url" onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhooks/behalfid" required type="url" value={url} />
                  <small className="field-help">Production endpoints must use HTTPS and cannot include URL credentials.</small>
                </label>
                <div className="setup-actions"><Button disabled={!webhooksEnabled} loading={creating} variant="primary">Create webhook</Button></div>
              </form>
              <div>
                <p className="settings-section__eyebrow">Subscribed events</p>
                <div className="webhook-event-set">
                  {events.map((eventType) => <code key={eventType}>{eventType}</code>)}
                </div>
              </div>
            </div>
            {webhookError ? <p className="form-error" role="alert">{webhookError}</p> : null}
            {secret ? (
              <SecretLifecycleNotice
                description="Copy this signing secret now. BehalfID stores only a hash and will show only a masked preview after you leave this state. Use it to verify webhook signatures."
                label="Signing secret"
                value={secret}
              />
            ) : null}
          </SettingsSection>

          <SettingsSection
            description="Status, subscribed events, and the latest recorded trigger time for each configured endpoint."
            eyebrow="Delivery destinations"
            id="webhook-endpoints"
            title="Endpoints"
          >
            {resource.data.webhooks.length ? (
              <div className="webhook-directory">
                {resource.data.webhooks.map((webhook) => (
                  <Link className="webhook-directory__row" href={dHref(`/dashboard/webhooks/${webhook.webhookId}`)} key={webhook.webhookId}>
                    <div className="webhook-directory__identity">
                      <code>{webhook.url}</code>
                      <div className="webhook-directory__meta">
                        <span>Created {date(webhook.createdAt)}</span>
                        <span><code>{webhook.webhookId}</code></span>
                      </div>
                    </div>
                    <div className="webhook-directory__events">{webhook.events.length} events Â· {webhook.events.join(", ")}</div>
                    <div className="webhook-directory__status">
                      <WebhookStatusBadge status={webhook.status} />
                      <small>Last delivery {date(webhook.lastTriggeredAt)}</small>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <DashboardState className="dashboard-empty" kind="empty" title="No webhook endpoints" description={webhooksEnabled ? "Create an endpoint to receive the subscribed signed events." : "Endpoint creation becomes available on a plan with webhook delivery."} />
            )}
          </SettingsSection>
        </>
      ) : null}
    </>
  );
}

function WebhookView({ webhookId }: { webhookId: string }) {
  const { apiJson: api } = useDashboardApi();
  const { href: dHref } = useDashboardPaths();
  const detail = useResource<{ webhook: Webhook; deliveries: Delivery[] }>(`/api/dashboard/webhooks/${webhookId}`);
  const [secret, setSecret] = useState("");
  const [actionError, setActionError] = useState("");
  const [working, setWorking] = useState<"rotate" | "enable" | "disable" | null>(null);
  const rotate = async () => {
    setWorking("rotate");
    setActionError("");
    try {
      setSecret((await api<{ secret: string }>(`/api/dashboard/webhooks/${webhookId}/rotate-secret`, { method: "POST" })).secret);
      await detail.reload();
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "Secret rotation failed.");
    } finally {
      setWorking(null);
    }
  };
  const setStatus = async (status: "enable" | "disable") => {
    setWorking(status);
    setActionError("");
    try {
      await api(`/api/dashboard/webhooks/${webhookId}/${status}`, { method: "POST" });
      await detail.reload();
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : `Webhook ${status} failed.`);
    } finally {
      setWorking(null);
    }
  };
  const webhook = detail.data?.webhook;
  if (detail.loading && !detail.data) {
    return <PageLoadingState label="Loading webhook endpoint" variant="detail" />;
  }
  return (
    <>
      <Header
        action={<ButtonLink href={dHref("/dashboard/webhooks")}>All endpoints</ButtonLink>}
        eyebrow="Workspace administration"
        title="Webhook endpoint"
        description="Inspect endpoint configuration, signing-secret lifecycle, and recorded delivery attempts."
      />
      <OperationsNavigation current="webhooks" />
      {detail.refreshing ? <RefreshingIndicator label="Refreshing webhook endpoint" /> : null}
      {detail.error && !detail.data ? <DashboardState kind="error" title="Webhook could not be loaded" description={detail.error} /> : null}
      {detail.error && detail.data ? <Alert tone="destructive">Webhook endpoint could not be refreshed: {detail.error}</Alert> : null}
      {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}
      {webhook ? (
        <>
          <SettingsSection
            action={<WebhookStatusBadge status={webhook.status} />}
            description="The endpoint URL and subscribed events are read-only in this dashboard flow."
            eyebrow="Endpoint configuration"
            id="webhook-endpoint-detail"
            title={<code>{webhook.url}</code>}
          >
            <div className="webhook-detail-summary">
              <dl className="settings-summary">
                <div><dt>Webhook ID</dt><dd><code>{webhook.webhookId}</code></dd></div>
                <div><dt>Endpoint URL</dt><dd><code>{webhook.url}</code></dd></div>
                <div><dt>Created</dt><dd>{date(webhook.createdAt)}</dd></div>
                <div><dt>Last delivery</dt><dd>{date(webhook.lastTriggeredAt)}</dd></div>
                <div><dt>Secret preview</dt><dd><code>{webhook.secretPreview}</code></dd></div>
              </dl>
              <div>
                <p className="settings-section__eyebrow">Subscribed events</p>
                <div className="webhook-event-set">
                  {webhook.events.map((eventType) => <code key={eventType}>{eventType}</code>)}
                </div>
              </div>
            </div>
            {secret ? (
              <SecretLifecycleNotice
                description="Copy the new signing secret now. The previous secret stopped signing new deliveries when rotation completed, and this value cannot be recovered later."
                label="Rotated signing secret"
                value={secret}
              />
            ) : null}
          </SettingsSection>

          <SettingsSection
            description="These controls immediately affect delivery configuration. No endpoint deletion action exists in this dashboard."
            eyebrow="Sensitive controls"
            id="webhook-sensitive-controls"
            title="Secret and endpoint status"
            tone="danger"
          >
            <div className="settings-page-content">
              <DestructiveSettingsSection
                action={(
                  <ConfirmDialog
                    confirmLabel="Rotate secret"
                    confirmVariant="danger"
                    description="Rotation replaces the signing secret used for future deliveries. Update the endpoint verifier with the new one-time value immediately."
                    loading={working === "rotate"}
                    onConfirm={() => rotate()}
                    title="Rotate signing secret?"
                    trigger={(open) => (
                      <Button loading={working === "rotate"} onClick={open} type="button" variant="danger">
                        Rotate secret
                      </Button>
                    )}
                  />
                )}
                consequence="Rotation replaces the signing secret used for future deliveries. Update the endpoint verifier with the new one-time value immediately."
                title="Rotate signing secret"
              />
              {webhook.status === "active" ? (
                <DestructiveSettingsSection
                  action={(
                    <ConfirmDialog
                      confirmLabel="Disable endpoint"
                      confirmVariant="danger"
                      description="Disabling stops this endpoint from receiving subscribed events until it is enabled again."
                      loading={working === "disable"}
                      onConfirm={() => setStatus("disable")}
                      title="Disable webhook delivery?"
                      trigger={(open) => (
                        <Button loading={working === "disable"} onClick={open} type="button" variant="danger">
                          Disable endpoint
                        </Button>
                      )}
                    />
                  )}
                  consequence="Disabling stops this endpoint from receiving subscribed events until it is enabled again."
                  title="Disable webhook delivery"
                />
              ) : (
                <div className="settings-callout">
                  <strong>Endpoint delivery is disabled.</strong>
                  Enable it to resume delivery for subscribed events. Plan enforcement still applies.
                  <div className="setup-actions"><Button loading={working === "enable"} onClick={() => void setStatus("enable")} variant="primary">Enable endpoint</Button></div>
                </div>
              )}
            </div>
          </SettingsSection>

          <SettingsSection
            description="The latest 50 delivery records returned for this endpoint, including retry attempt and failure details when available."
            eyebrow="Delivery observability"
            id="webhook-delivery-history"
            title="Delivery history"
          >
            {detail.data?.deliveries.length ? (
              <div className="webhook-delivery-list">
                {detail.data.deliveries.map((delivery) => (
                  <article className="webhook-delivery-row" key={delivery.deliveryId}>
                    <div className="webhook-delivery-row__identity">
                      <strong><code>{delivery.eventType}</code></strong>
                      <div className="webhook-delivery-row__meta">
                        <span><code>{delivery.eventId}</code></span>
                        <span>Attempt {delivery.attempt}{delivery.maxAttempts ? ` of ${delivery.maxAttempts}` : ""}</span>
                        <span>{date(delivery.createdAt)}</span>
                        {delivery.nextRetryAt ? <span>Retry {date(delivery.nextRetryAt)}</span> : null}
                      </div>
                    </div>
                    <div className="webhook-delivery-row__status">
                      <DeliveryStatusBadge status={delivery.status} />
                      <small>{delivery.httpStatus ? `HTTP ${delivery.httpStatus}` : "No HTTP status"}</small>
                    </div>
                    {delivery.error ? <p className="webhook-delivery-row__error">{delivery.error}</p> : null}
                  </article>
                ))}
              </div>
            ) : (
              <DashboardState className="dashboard-empty" kind="empty" title="No deliveries recorded" description="Delivery attempts appear after a subscribed event reaches this endpoint." />
            )}
          </SettingsSection>
        </>
      ) : null}
    </>
  );
}

function LogsViewInner() {
  const searchParams = useSearchParams();
  return (
    <OpsLogConsole
      initialSearch={searchParams.get("search") ?? undefined}
      initialAgentId={searchParams.get("agentId") ?? undefined}
      initialDecision={searchParams.get("decision") ?? undefined}
      initialRisk={searchParams.get("risk") ?? undefined}
      initialAction={searchParams.get("action") ?? undefined}
      initialEnvironment={searchParams.get("environment") ?? undefined}
      initialRange={searchParams.get("range") ?? undefined}
    />
  );
}

function LogsView() {
  return (
    <Suspense fallback={<OpsLogConsole compact title="Audit logs" description="Loading logsâ€¦" />}>
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

function InboxView() {
  const { apiJson: api } = useDashboardApi();
  const inbox = useResource<{ pendingApprovals: ApprovalRequest[]; deniedHighRisk: Log[]; workspaceAuthority?: WorkspaceAuthority | null }>("/api/dashboard/inbox");
  const [working, setWorking] = useState<{ approvalId: string; action: "approve" | "deny" } | null>(null);
  const [resolveError, setResolveError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const resolve = async (approvalId: string, action: "approve" | "deny") => {
    setWorking({ approvalId, action });
    setResolveError("");
    setStatusMessage("");
    try {
      await api(`/api/dashboard/approvals/${approvalId}/${action}`, { method: "POST" });
      await inbox.reload();
      setStatusMessage(
        action === "approve"
          ? "Request approved. The grant remains bound to the original request and can be consumed once."
          : "Request denied. The agent action remains blocked."
      );
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
      statusMessage={statusMessage}
      onResolve={resolve}
      dateFormatter={date}
    />
  );
}

function MembersPanel({ members }: { members: DashboardResource<MembersResponse> }) {
  const { apiJson: api } = useDashboardApi();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("ENGINEER");
  const [memberError, setMemberError] = useState("");
  const [lastInviteUrl, setLastInviteUrl] = useState("");
  const [memberWorking, setMemberWorking] = useState<string | null>(null);

  const addMember = async (event: FormEvent) => {
    event.preventDefault();
    setMemberError("");
    setLastInviteUrl("");
    setMemberWorking("add");
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
    } finally {
      setMemberWorking(null);
    }
  };

  const updateRole = async (membershipId: string, nextRole: string) => {
    setMemberError("");
    setMemberWorking(`role:${membershipId}`);
    try {
      await api(`/api/dashboard/members/${membershipId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole })
      });
      await members.reload();
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : "Could not update role.");
    } finally {
      setMemberWorking(null);
    }
  };

  const removeMember = async (membershipId: string) => {
    setMemberError("");
    setMemberWorking(`remove:${membershipId}`);
    try {
      await api(`/api/dashboard/members/${membershipId}`, { method: "DELETE" });
      await members.reload();
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : "Could not remove member.");
    } finally {
      setMemberWorking(null);
    }
  };

  const revokeInvite = async (inviteId: string) => {
    setMemberError("");
    setMemberWorking(`invite:${inviteId}`);
    try {
      await api(`/api/dashboard/members/invites/${inviteId}`, { method: "DELETE" });
      await members.reload();
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : "Could not revoke invite.");
    } finally {
      setMemberWorking(null);
    }
  };

  return (
    <SettingsSection
      description="Workspace roles define who can manage membership and the maximum authority available for agent permissions and approvals."
      eyebrow="Workspace-level"
      id="members"
      title="Members and roles"
      tone={members.data && !members.data.canManageMembers ? "restricted" : "default"}
    >
      {!members.data && !members.error ? <DashboardState kind="loading" title="Loading members" description="Retrieving active memberships and pending invitations." /> : null}
      {members.refreshing ? <RefreshingIndicator label="Refreshing members" /> : null}
      {members.error && !members.data ? <DashboardState kind="error" title="Members could not be loaded" description={members.error} /> : null}
      {members.error && members.data ? <Alert tone="destructive">Members could not be refreshed: {members.error}</Alert> : null}
      {members.data?.workspaceAuthority ? (
        <div className="settings-callout">
          <strong>Your authority: {members.data.workspaceAuthority.roleLabel} Â· level {members.data.workspaceAuthority.authorityLevel}</strong>
          {members.data.canManageMembers
            ? "You can assign roles below your own authority. The server applies self-removal and last-owner protections."
            : "Your role cannot change workspace membership. Member data is limited by the workspace visibility rules."}
        </div>
      ) : null}
      {memberError ? <p className="form-error" role="alert">{memberError}</p> : null}
      {lastInviteUrl ? (
        <div className="invite-receipt" role="status">
          <strong>Invitation created</strong>
          <span>Share this invite link with the intended recipient:</span>
          <code className="invite-link">{lastInviteUrl}</code>
        </div>
      ) : null}
      <div className="member-directory" aria-label="Active workspace members">
        {(members.data?.members ?? []).map((member) => (
          <div key={member.membershipId} className="member-directory__row member-row member-row--active">
            <div className="member-directory__identity">
              <strong>{member.email ?? member.userId}</strong>
              <div className="member-directory__meta">
                <span>Active member</span>
                <span><code>{member.userId}</code></span>
                <span>Joined {date(member.createdAt)}</span>
              </div>
            </div>
            {members.data?.canManageMembers ? (
              <div className="member-directory__actions">
                <MemberRoleBadge role={member.role} />
                <select
                  aria-label={`Role for ${member.email ?? member.userId}`}
                  value={member.role}
                  disabled={memberWorking !== null}
                  onChange={(event) => void updateRole(member.membershipId, event.target.value)}
                >
                  <option value="ENGINEERING_LEAD">Engineering Lead</option>
                  <option value="SENIOR_ENGINEER">Senior Engineer</option>
                  <option value="ENGINEER">Engineer</option>
                  <option value="VIEWER">Viewer</option>
                </select>
                <ConfirmDialog
                  confirmLabel="Remove member"
                  confirmVariant="danger"
                  description="Removing a member ends their workspace membership. Server-side owner and authority safeguards still apply."
                  loading={memberWorking === `remove:${member.membershipId}`}
                  onConfirm={() => removeMember(member.membershipId)}
                  title={`Remove ${member.email ?? member.userId}?`}
                  trigger={(open) => (
                    <Button loading={memberWorking === `remove:${member.membershipId}`} onClick={open} type="button" variant="danger">
                      Remove
                    </Button>
                  )}
                />
              </div>
            ) : <MemberRoleBadge role={member.role} />}
            {members.data?.canManageMembers ? <p className="member-directory__consequence">Removing a member ends their workspace membership; server-side owner and authority safeguards still apply.</p> : null}
          </div>
        ))}
      </div>
      {(members.data?.pendingInvites ?? []).length > 0 ? (
        <div className="settings-subsection">
          <h3>Pending invites</h3>
          <p>Invited addresses remain pending until accepted or revoked.</p>
          <div className="member-directory">
            {members.data?.pendingInvites.map((invite) => (
              <div key={invite.inviteId} className="member-directory__row member-row member-row--pending">
                <div className="member-directory__identity">
                  <strong>{invite.email}</strong>
                  <div className="member-directory__meta"><span>Pending invite</span><span>Created {date(invite.createdAt)}</span></div>
                </div>
                {members.data?.canManageMembers ? (
                  <div className="member-directory__actions">
                    <MemberRoleBadge role={invite.role} />
                    <ConfirmDialog
                      confirmLabel="Revoke invite"
                      confirmVariant="danger"
                      description="The invite link stops working. You can send a new invite later if needed."
                      loading={memberWorking === `invite:${invite.inviteId}`}
                      onConfirm={() => revokeInvite(invite.inviteId)}
                      title={`Revoke invite for ${invite.email}?`}
                      trigger={(open) => (
                        <Button loading={memberWorking === `invite:${invite.inviteId}`} onClick={open} type="button" variant="danger">
                          Revoke invite
                        </Button>
                      )}
                    />
                  </div>
                ) : <MemberRoleBadge role={invite.role} />}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {members.data?.canManageMembers ? (
        <div className="settings-subsection">
          <h3>Add member</h3>
          <p>Existing BehalfID users join immediately. New addresses receive a pending invitation and shareable link.</p>
          <form className="operations-form-grid" onSubmit={addMember}>
            <label>
              <span>Email</span>
              <input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="engineer@company.com" />
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
            <div className="setup-actions"><Button loading={memberWorking === "add"} variant="primary" type="submit">Add member</Button></div>
          </form>
        </div>
      ) : null}
    </SettingsSection>
  );
}

function SsoSettingsCard({ canEditWorkspace }: { canEditWorkspace: boolean }) {
  const { apiJson: api } = useDashboardApi();
  const ssoResource = useResource<{
    available: boolean;
    canEdit: boolean;
    sso: {
      provider: "google";
      enabled: boolean;
      enforce: boolean;
      allowedEmailDomains: string[];
    };
    plan: string;
  }>("/api/dashboard/sso");
  const [enabled, setEnabled] = useState(false);
  const [enforce, setEnforce] = useState(false);
  const [domainsText, setDomainsText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ssoResource.data) return;
    setEnabled(ssoResource.data.sso.enabled);
    setEnforce(ssoResource.data.sso.enforce);
    setDomainsText(ssoResource.data.sso.allowedEmailDomains.join("\n"));
  }, [ssoResource.data]);

  const saveSso = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setSaving(true);
    try {
      const allowedEmailDomains = domainsText
        .split(/[\n,]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      await api("/api/dashboard/sso", {
        method: "PATCH",
        body: JSON.stringify({ enabled, enforce, allowedEmailDomains })
      });
      setMessage("Google SSO settings saved.");
      await ssoResource.reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save SSO settings.");
    } finally {
      setSaving(false);
    }
  };

  if (!ssoResource.data && !ssoResource.error) {
    return (
      <SettingsSection
        description="Company domain allowlist and optional password-login enforcement for Google sign-in."
        eyebrow="Workspace-level"
        id="google-sso"
        title="Google SSO"
      >
        <p className="field-help">Loading SSO settingsâ€¦</p>
      </SettingsSection>
    );
  }

  if (ssoResource.error || !ssoResource.data) {
    return (
      <SettingsSection
        description="Company domain allowlist and optional password-login enforcement for Google sign-in."
        eyebrow="Workspace-level"
        id="google-sso"
        title="Google SSO"
      >
        <p className="form-error" role="alert">{ssoResource.error || "Unable to load SSO settings."}</p>
      </SettingsSection>
    );
  }

  if (!ssoResource.data.available) {
    return (
      <SettingsSection
        description="Company domain allowlist and optional password-login enforcement for Google sign-in."
        eyebrow="Workspace-level"
        id="google-sso"
        title="Google SSO"
        tone="restricted"
      >
        <p className="field-help">
          Workspace Google SSO is available on Pro and higher plans.
          Sign in with Google for individual accounts is available on all plans from the login page.
        </p>
      </SettingsSection>
    );
  }

  const canEdit = Boolean(ssoResource.data.canEdit && canEditWorkspace);

  return (
    <SettingsSection
      description="Require or prefer Google sign-in for members whose email matches your company domains. Invites are still required to join this workspace."
      eyebrow="Workspace-level"
      id="google-sso"
      title="Google SSO"
      tone={canEdit ? "default" : "restricted"}
    >
      {canEdit ? (
        <form className="setup-form" onSubmit={saveSso}>
          <label className="setup-check">
            <input checked={enabled} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />
            <span className="setup-check__body">
              <span className="setup-check__label">Enable Google SSO for allowed domains</span>
            </span>
          </label>
          <label className="setup-check">
            <input
              checked={enforce}
              disabled={!enabled}
              onChange={(event) => setEnforce(event.target.checked)}
              type="checkbox"
            />
            <span className="setup-check__body">
              <span className="setup-check__label">Enforce Google sign-in (block password login for these domains)</span>
            </span>
          </label>
          <label>
            <span>Allowed email domains</span>
            <textarea
              onChange={(event) => setDomainsText(event.target.value)}
              placeholder={"acme.com\nengineering.acme.com"}
              rows={4}
              value={domainsText}
            />
          </label>
          <p className="field-help">One domain per line. Public providers like gmail.com cannot be used when enforcement is on.</p>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {message ? <p className="field-help">{message}</p> : null}
          <div className="setup-actions">
            <Button disabled={saving} loading={saving} type="submit" variant="primary">
              {saving ? "Savingâ€¦" : "Save SSO settings"}
            </Button>
          </div>
        </form>
      ) : (
        <dl className="settings-summary">
          <div><dt>Status</dt><dd>{ssoResource.data.sso.enabled ? "Enabled" : "Disabled"}</dd></div>
          <div><dt>Enforce</dt><dd>{ssoResource.data.sso.enforce ? "On" : "Off"}</dd></div>
          <div>
            <dt>Domains</dt>
            <dd>
              {ssoResource.data.sso.allowedEmailDomains.length
                ? ssoResource.data.sso.allowedEmailDomains.join(", ")
                : "None"}
            </dd>
          </div>
        </dl>
      )}
    </SettingsSection>
  );
}

function SettingsView() {
  const { apiJson: api } = useDashboardApi();
  const { href: dHref } = useDashboardPaths();
  const settings = useResource<{
    email: string;
    appUrl: string;
    apiUsage: string;
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
        protectionPolicy?: ProtectionPolicy | null;
        primaryGoal?: string;
        firstSetupGoal?: string;
      } | null;
    } | null;
    canEditAccountFields?: boolean;
  }>("/api/dashboard/settings");
  const tokens = useResource<{ tokens: DeveloperToken[] }>("/api/dashboard/tokens");
  const members = useResource<MembersResponse>("/api/dashboard/members");
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
    protectionPolicy: defaultProtectionPolicy(),
    primaryGoal: "",
    firstSetupGoal: ""
  });
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveWorking, setSaveWorking] = useState<"profile" | "account" | null>(null);
  const [tokenError, setTokenError] = useState("");
  const [tokenWorking, setTokenWorking] = useState<string | null>(null);

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
    // Existing settings form synchronization; keep behavior unchanged while this file is linted for the agent extraction.
    // The API response intentionally becomes the editable form snapshot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      protectionPolicy: protectionPolicyOrDefault(settings.data.account?.onboarding?.protectionPolicy),
      primaryGoal: settings.data.account?.onboarding?.primaryGoal ?? "",
      firstSetupGoal: settings.data.account?.onboarding?.firstSetupGoal ?? ""
    });
  }, [settings.data]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaveError("");
    setSaveMessage("");
    setSaveWorking("profile");
    try {
      await api("/api/dashboard/settings", {
        method: "PATCH",
        body: JSON.stringify(profileForm)
      });
      setSaveMessage("Profile updated.");
      await settings.reload();
    } catch (requestError) {
      setSaveError(requestError instanceof Error ? requestError.message : "Failed to save profile.");
    } finally {
      setSaveWorking(null);
    }
  };

  const saveAccount = async (event: FormEvent) => {
    event.preventDefault();
    setSaveError("");
    setSaveMessage("");
    setSaveWorking("account");
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
          controlAreasOther: accountForm.controlAreasOther,
          protectionPolicy: accountForm.protectionPolicy,
          primaryGoal: accountForm.primaryGoal || undefined,
          firstSetupGoal: accountForm.firstSetupGoal || undefined
        })
      });
      setSaveMessage("Workspace settings updated.");
      await settings.reload();
    } catch (requestError) {
      setSaveError(requestError instanceof Error ? requestError.message : "Failed to save workspace settings.");
    } finally {
      setSaveWorking(null);
    }
  };

  const createToken = async (event: FormEvent) => {
    event.preventDefault();
    setTokenError("");
    setTokenWorking("create");
    try {
      const result = await api<{ token: string }>("/api/dashboard/tokens", {
        method: "POST",
        body: JSON.stringify({ name: tokenName })
      });
      setNewToken(result.token);
      setTokenName("");
      await tokens.reload();
    } catch (requestError) {
      setTokenError(requestError instanceof Error ? requestError.message : "Could not create developer token.");
    } finally {
      setTokenWorking(null);
    }
  };

  const revokeToken = async (tokenId: string) => {
    setTokenError("");
    setTokenWorking(tokenId);
    try {
      await api(`/api/dashboard/tokens/${tokenId}`, { method: "DELETE" });
      await tokens.reload();
    } catch (requestError) {
      setTokenError(requestError instanceof Error ? requestError.message : "Could not revoke developer token.");
    } finally {
      setTokenWorking(null);
    }
  };

  const initialLoading = [settings, tokens, members].some((resource) => resource.loading && !resource.data);
  if (initialLoading) {
    return <PageLoadingState label="Loading settings, members, and developer tokens" variant="settings" />;
  }

  if (settings.error && !settings.data) {
    return (
      <>
        <Header eyebrow="Workspace administration" title="Settings" description="Manage account identity, workspace policy context, membership, and developer access." />
        <OperationsNavigation current="settings" />
        <DashboardState kind="error" title="Settings could not be loaded" description={settings.error} />
      </>
    );
  }

  return (
    <>
      <Header eyebrow="Workspace administration" title="Settings" description="Manage account identity, workspace policy context, membership, and developer access." />
      <OperationsNavigation current="settings" />
      {settings.refreshing || tokens.refreshing || members.refreshing ? (
        <RefreshingIndicator label="Refreshing workspace settings" />
      ) : null}
      {settings.error && settings.data ? <Alert tone="destructive">Workspace settings could not be refreshed: {settings.error}</Alert> : null}
      {saveMessage ? <p className="setup-banner" role="status">{saveMessage}</p> : null}
      {saveError ? <p className="form-error" role="alert">{saveError}</p> : null}
      <div className="settings-page-layout">
        <SettingsNavigation items={[
          { href: "#managed-security", label: "Security", detail: "Managed local sessions" },
          { href: "#mfa", label: "Two-factor auth", detail: "TOTP authenticator" },
          { href: "#account-security", label: "Authentication methods", detail: "Password, GitHub, passkeys" },
          { href: "#account", label: "Account", detail: "Your personal profile" },
          { href: "#workspace", label: "Workspace", detail: "Shared identity and context" },
          { href: "#google-sso", label: "Google SSO", detail: "Domain allowlist and enforce" },
          { href: "#members", label: "Members & roles", detail: "Authority and invitations" },
          { href: "#developer-access", label: "Developer access", detail: "API tokens and usage" },
          { href: "#danger-zone", label: "Destructive actions", detail: "Account deletion support" }
        ]} />
        <div className="settings-page-content">
      <SettingsSection
        action={<ButtonLink href={dHref("/dashboard/managed-profiles")} variant="secondary">Open managed profiles</ButtonLink>}
        description="Configure whether supported local Claude, Codex, and Cursor sessions run unmanaged, managed, or required."
        eyebrow="Security controls"
        id="managed-security"
        title="Managed profiles"
      >
        <p className="field-help">
          Managed profile policy has its own workspace view, activity history, plan enforcement, and authority checks.
        </p>
      </SettingsSection>
      <SettingsSection
        description="Require an authenticator app code after password sign-in."
        eyebrow="Account security"
        id="mfa"
        title="Two-factor authentication"
      >
        <MfaSettingsSection />
      </SettingsSection>
      <LinkedAccountsSection />
      <SettingsSection
        description="Personal contact details belong to your BehalfID account and follow you across workspace access."
        eyebrow="Account-level"
        id="account"
        title="Your profile"
      >
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
            <Button loading={saveWorking === "profile"} type="submit" variant="primary">Save profile</Button>
          </div>
        </form>
      </SettingsSection>
      <SettingsSection
        description="Shared workspace identity and onboarding context used across the control plane."
        eyebrow="Workspace-level"
        id="workspace"
        title="Workspace profile"
        tone={settings.data?.canEditAccountFields ? "default" : "restricted"}
      >
        {workspaceUrl ? (
          <dl className="settings-summary">
            <div>
              <dt>Workspace URL</dt>
              <dd className="settings-summary__value-action">
                <code>{workspaceUrl}</code>
                <Button aria-label="Copy workspace URL" size="small" type="button" variant="secondary" onClick={() => void copyWorkspaceUrl()}>
                  {copiedUrl ? "Copied" : "Copy"}
                </Button>
              </dd>
            </div>
          </dl>
        ) : null}
        {settings.data ? (
          <dl className="settings-summary">
            <div>
              <dt>Account type</dt>
              <dd>
                {settings.data.account?.accountType === "business"
                  ? "Business / team"
                  : settings.data.account?.accountType === "individual"
                    ? "Individual"
                    : "Not set"}
              </dd>
            </div>
            <div>
              <dt>Your workspace authority</dt>
              <dd>
                {settings.data.delegatedPermissions
                  ? `${settings.data.delegatedPermissions.roleLabel} (authority ${settings.data.delegatedPermissions.authorityLevel})`
                  : "Owner (authority 100)"}
              </dd>
            </div>
          </dl>
        ) : null}
        <p className="field-help">The workspace URL is stable; slug changes are not available in this release.</p>
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
            <fieldset className="setup-fieldset setup-fieldset--policy">
              <legend>Default protection for new agents</legend>
              <p className="field-help">
                The starting point for the next agent you create. Agents that already exist keep the
                permissions they were given — edit those on the agent&rsquo;s own page.
              </p>
              <ProtectionPolicyEditor
                onChange={(next) => setAccountForm((prev) => ({ ...prev, protectionPolicy: next }))}
                policy={accountForm.protectionPolicy}
              />
              <ProtectionSummary
                policy={accountForm.protectionPolicy}
                title="What a new agent would start with"
              />
            </fieldset>
            <label>
              <span>Primary goal</span>
              <select
                onChange={(event) => setAccountForm((prev) => ({ ...prev, primaryGoal: event.target.value }))}
                value={accountForm.primaryGoal}
              >
                <option value="">Selectâ€¦</option>
                {PRIMARY_GOALS.map((goal) => (
                  <option key={goal} value={goal}>{PRIMARY_GOAL_LABELS[goal]}</option>
                ))}
              </select>
            </label>
            <div className="setup-actions">
              <Button loading={saveWorking === "account"} type="submit" variant="primary">Save workspace</Button>
            </div>
          </form>
        ) : (
          <div className="restricted-notice" role="status">
            <strong>Workspace editing is restricted.</strong>
            Owners and Engineering Leads can update these shared fields. Your account profile remains independently editable above.
          </div>
        )}
      </SettingsSection>
      <SsoSettingsCard canEditWorkspace={Boolean(settings.data?.canEditAccountFields)} />
      <MembersPanel members={members} />
      <SettingsSection
        description="Personal developer credentials for SDK and API calls that require developer context. Raw token values are never listed again."
        eyebrow="Account-level"
        id="developer-access"
        title="Developer API tokens"
      >
        <dl className="settings-summary">
          <div><dt>API base URL</dt><dd><code>{settings.data?.appUrl}</code></dd></div>
          <div><dt>Verification usage</dt><dd>{settings.data?.apiUsage}</dd></div>
          <div><dt>Token limit</dt><dd>Up to 10 developer tokens per user</dd></div>
        </dl>
        {tokenError ? <p className="form-error" role="alert">{tokenError}</p> : null}
        <div className="settings-subsection">
          <h3>Create token</h3>
          <p>Use a name that identifies the environment or workflow holding the credential.</p>
          <form className="operations-form-grid" onSubmit={createToken}>
            <label className="operations-form-grid__wide">
              <span>Token name</span>
              <input disabled={tokenWorking !== null} maxLength={120} onChange={(event) => setTokenName(event.target.value)} placeholder="CI, local dev, staging" required value={tokenName} />
            </label>
            <div className="setup-actions"><Button loading={tokenWorking === "create"} variant="primary" type="submit">Create token</Button></div>
          </form>
        </div>
        {newToken ? (
          <SecretLifecycleNotice
            description="Copy this token now. BehalfID stores only its hash and masked preview, so this value cannot be recovered later."
            label="Developer API token"
            value={newToken}
          />
        ) : null}
        <div className="settings-subsection">
          <h3>Issued tokens</h3>
          <p>Metadata and masked previews are safe to review here; raw credential material is not returned.</p>
          {!tokens.data && !tokens.error ? <DashboardState kind="loading" title="Loading developer tokens" description="Retrieving token metadata without raw credentials." /> : null}
          {tokens.error && !tokens.data ? <DashboardState kind="error" title="Developer tokens could not be loaded" description={tokens.error} /> : null}
          {tokens.error && tokens.data ? <Alert tone="destructive">Developer tokens could not be refreshed: {tokens.error}</Alert> : null}
          <div className="developer-token-list">
            {(tokens.data?.tokens ?? []).map((token) => (
              <div className="developer-token-row" key={token.tokenId}>
                <div className="developer-token-row__identity">
                  <strong>{token.name}</strong>
                  <div className="developer-token-row__meta">
                    <span><code>{token.tokenPreview ?? "Preview unavailable"}</code></span>
                    <span>Created {date(token.createdAt)}</span>
                    <span>Last used {date(token.lastUsedAt)}</span>
                    <span>Active</span>
                  </div>
                </div>
                <div className="developer-token-row__actions">
                  <ConfirmDialog
                    confirmLabel="Revoke token"
                    confirmVariant="danger"
                    description="Revocation immediately stops this token from authenticating future API requests."
                    loading={tokenWorking === token.tokenId}
                    onConfirm={() => revokeToken(token.tokenId)}
                    title={`Revoke ${token.name}?`}
                    trigger={(open) => (
                      <Button loading={tokenWorking === token.tokenId} onClick={open} type="button" variant="danger">
                        Revoke
                      </Button>
                    )}
                  >
                    <p>Preview: <code>{token.tokenPreview ?? "Preview unavailable"}</code></p>
                  </ConfirmDialog>
                </div>
                <p className="developer-token-row__consequence">Revocation immediately stops this token from authenticating future API requests.</p>
              </div>
            ))}
          </div>
          {tokens.data && tokens.data.tokens.length === 0 ? <DashboardState className="dashboard-empty" kind="empty" title="No developer tokens" description="Create a token when a developer workflow needs account-authenticated API access." /> : null}
        </div>
      </SettingsSection>
      <AccountDeletionSection />
        </div>
      </div>
    </>
  );
}

const DOC_CARDS = [
  { title: "Quickstart", description: "Create an agent, add a permission, call verify(), and prove allowed and denied actions.", href: "/docs/quickstart" },
  { title: "CLI & MCP", description: "Install the CLI, wire up the MCP server, and launch Claude Code or Codex with enforcement active.", href: "/docs/cli" },
  { title: "Managed profiles", description: "Configure when local Claude, Codex, and Cursor sessions run unmanaged, managed, or required.", href: "/dashboard/managed-profiles" },
  { title: "Deploy approvals", description: "Full demo: agent hits approval gate â†’ you approve in this dashboard â†’ agent retries and deploys.", href: "/docs/deploy-approvals" },
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

function Rows<T>({ items, href, title, meta }: { items: T[]; href: (item: T) => string; title: (item: T) => string; meta: (item: T) => string }) {
  if (!items.length) return <EmptyState className="dashboard-empty">Nothing here yet.</EmptyState>;
  return <div className="dashboard-list">{items.map((item) => <Link href={href(item)} key={href(item)}><span><strong>{title(item)}</strong><small>{meta(item)}</small></span></Link>)}</div>;
}
function Header({
  title,
  description,
  action,
  breadcrumb,
  eyebrow,
  status
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  eyebrow?: string;
  status?: React.ReactNode;
}) {
  return (
    <PageHeader
      title={title}
      description={description}
      action={action}
      breadcrumb={breadcrumb}
      eyebrow={eyebrow}
      status={status}
      className="dashboard-header"
    />
  );
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
    <div className="deny-receipt" id={`receipt-${log.requestId}`} role="region" aria-label="Deny receipt">
      <div className="deny-receipt__header">
        <span className={`console-status ${approvalReq ? "console-status--approval" : "console-status--denied"}`}>
          {decisionLabel}
        </span>
        <div className="deny-receipt__actions">
          <button className="deny-receipt__copy" type="button" onClick={copy}>
            {copied ? "Copied" : "Copy receipt"}
          </button>
          <button className="deny-receipt__close" type="button" onClick={onClose} aria-label="Close receipt">âœ•</button>
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
  if (!filtered.length) {
    return (
      <DashboardState
        kind="empty"
        title={approvalFilter ? "No approval-required decisions" : "No activity for this agent"}
        description={approvalFilter
          ? "This agent has no approval-required records in the returned history."
          : "Verification decisions will appear here after this agent calls verify()."}
      />
    );
  }
  return (
    <div className="agent-decision-list" role="list" aria-label="Agent decision history">
      {filtered.map((log) => {
        const approvalReq = isApprovalRequired(log);
        const isDenied = !log.allowed;
        const showReceipt = openReceipt === log.requestId;
        return (
          <article className="agent-decision-row" key={log.requestId} role="listitem">
            <div className="agent-decision-row__time">
              <time dateTime={log.createdAt}>{date(log.createdAt)}</time>
            </div>
            <div className="agent-decision-row__decision">
              <DecisionIndicator log={log} compact />
              <RiskIndicator risk={log.risk} />
            </div>
            <div className="agent-decision-row__event">
              <code>{log.action}</code>
              <span>
                {log.vendor || "No target recorded"}
                {typeof log.amount === "number" ? ` Â· $${log.amount}` : ""}
              </span>
            </div>
            <div className="agent-decision-row__reason">
              <p>{log.reason}</p>
              <code title={log.requestId}>{log.requestId}</code>
            </div>
            <div className="agent-decision-row__action">
              {isDenied ? (
                <Button
                  className="deny-receipt__toggle"
                  type="button"
                  variant="ghost"
                  size="small"
                  onClick={() => setOpenReceipt(showReceipt ? null : log.requestId)}
                  aria-expanded={showReceipt}
                  aria-controls={`receipt-${log.requestId}`}
                >
                  {showReceipt ? "Hide receipt" : "View receipt"}
                </Button>
              ) : null}
            </div>
            {showReceipt ? <DenyReceipt log={log} onClose={() => setOpenReceipt(null)} /> : null}
            <span className="sr-only">{approvalReq ? "This action required approval." : null}</span>
          </article>
        );
      })}
    </div>
  );
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
