"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  DashboardState,
  EmptyState,
  PageHeader,
  PageLoadingState,
  RefreshingIndicator,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import {
  EnforcementModeBadge,
  ProfileStatusBadge,
  ProtectedRepositoryStatusBadge,
  type EnforcementMode,
  type ProtectedRepositoryState,
} from "@/components/dashboard/ProfileIntegrationPrimitives";
import { useDashboardApi } from "@/components/workspace/WorkspaceProvider";
import { haptic } from "@/lib/haptic";
import type { ManagedProfileActivityEvent } from "@/lib/cliAuditActivityTypes";
import { MANAGED_PROFILE_ONBOARDING_STEPS } from "@/lib/managedProfileOnboarding";

type PolicyMode = EnforcementMode;

type ManagedProfilePolicy = {
  policyId: string | null;
  accountId: string;
  timezone: string;
  enabled: boolean;
  workHours: {
    enabled: boolean;
    days: number[];
    start: string;
    end: string;
  };
  duringHoursMode: PolicyMode;
  outsideHoursMode: PolicyMode;
  defaultMode: PolicyMode;
  toolModes: {
    claude?: PolicyMode;
    codex?: PolicyMode;
    cursor?: PolicyMode;
  };
  protectedRepos: Array<{
    repoHash: string;
    label?: string;
    mode: PolicyMode;
    enabled: boolean;
  }>;
  pausePolicy: {
    enabled: boolean;
    reasonRequired: boolean;
    maxDurationMinutes: number;
    allowAllRepos: boolean;
    requireApprovalForRequiredMode: boolean;
  };
  createdAt?: string;
  updatedAt?: string;
};

type ManagedProfilesResponse = {
  policy: ManagedProfilePolicy;
  canEdit: boolean;
};

type PolicySimulationResult = {
  ok: true;
  mode: PolicyMode;
  reason: string;
  profileId: string | null;
  profileName: string | null;
  matchedRule: {
    type: string;
    repoHash?: string;
    tool?: string;
    mode?: PolicyMode;
  } | null;
  pausePolicy: ManagedProfilePolicy["pausePolicy"];
};

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const MODE_OPTIONS: Array<{ value: PolicyMode; label: string }> = [
  { value: "unmanaged", label: "Unmanaged" },
  { value: "managed", label: "Managed" },
  { value: "required", label: "Required" },
];

const MANAGED_TOOLS = [
  { id: "claude", label: "Claude", runtime: "Claude Code CLI" },
  { id: "codex", label: "Codex", runtime: "Codex CLI" },
  { id: "cursor", label: "Cursor", runtime: "Cursor CLI" },
] as const;

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const ACTIVITY_EVENT_TYPE_LABELS: Record<ManagedProfileActivityEvent["eventType"], string> = {
  cli_session_policy: "Session policy",
  cli_pause_grant: "Pause grant",
  cli_pause_deny: "Pause denial",
  cli_pause_approval_requested: "Pause approval requested",
};

const MODE_DESCRIPTIONS: Record<PolicyMode, string> = {
  unmanaged: "The shim launches the tool without managed policy context.",
  managed: "The shim attaches workspace policy context. Managed mode is not an outage fail-closed boundary.",
  required: "The launcher requires managed session context and configured credentials. Outage behavior depends on the policy cache.",
};

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const absSec = Math.abs(diffSec);
  if (absSec < 60) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, "hour");
  const diffDay = Math.round(diffHour / 24);
  return rtf.format(diffDay, "day");
}

function formatTimestamp(value?: string) {
  if (!value) return "Not saved yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function activityEventTypeLabel(eventType: ManagedProfileActivityEvent["eventType"]) {
  return ACTIVITY_EVENT_TYPE_LABELS[eventType] ?? eventType;
}

function selectedDaysLabel(days: number[]) {
  return WEEKDAYS.filter((day) => days.includes(day.value))
    .map((day) => day.label)
    .join(", ");
}

function protectedRepositoryState(
  policyEnabled: boolean,
  repoEnabled: boolean
): ProtectedRepositoryState {
  if (!policyEnabled) return "policy-disabled";
  if (!repoEnabled) return "configured-disabled";
  return "protected";
}

function OnboardingCompactCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const copy = () => {
    const failCopy = () => {
      setCopied(false);
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 2000);
    };

    if (!navigator.clipboard?.writeText) {
      failCopy();
      return;
    }

    void navigator.clipboard
      .writeText(command)
      .then(() => {
        haptic("success");
        setCopyFailed(false);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(failCopy);
  };

  const copyLabel = copied ? "Copied" : copyFailed ? "Copy failed" : "Copy";

  return (
    <div className="onboarding-command-row">
      <code className="onboarding-command-row__text">{command}</code>
      <button
        type="button"
        className={[
          "onboarding-command-row__copy",
          copied ? "onboarding-command-row__copy--ok" : "",
          copyFailed ? "onboarding-command-row__copy--error" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={copy}
        aria-label={`Copy ${command}`}
      >
        {copyLabel}
      </button>
    </div>
  );
}

function OnboardingCommandGroup({ commands }: { commands: string[] }) {
  return (
    <div className="onboarding-command-group">
      {commands.map((command) => (
        <OnboardingCompactCommand command={command} key={command} />
      ))}
    </div>
  );
}

function emptyProtectedRepo() {
  return { repoHash: "", label: "", mode: "required" as PolicyMode, enabled: true };
}

function ModeSelect({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (mode: PolicyMode) => void;
  value: PolicyMode;
}) {
  return (
    <label>
      <span>{label}</span>
      <select
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as PolicyMode)}
        value={value}
      >
        {MODE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ManagedProfilesView() {
  const { apiJson, href, workspaceSlug } = useDashboardApi();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [form, setForm] = useState<ManagedProfilePolicy | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [simulateTool, setSimulateTool] = useState<"claude" | "codex" | "cursor">("claude");
  const [simulateRepoHash, setSimulateRepoHash] = useState("");
  const [simulateBranch, setSimulateBranch] = useState("main");
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [simulateError, setSimulateError] = useState("");
  const [simulateResult, setSimulateResult] = useState<PolicySimulationResult | null>(null);
  const [lastActivity, setLastActivity] = useState<ManagedProfileActivityEvent | null>(null);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [activityFetchFailed, setActivityFetchFailed] = useState(false);

  const loadPolicy = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await apiJson<ManagedProfilesResponse>("/api/dashboard/managed-profiles");
      setForm(data.policy);
      setCanEdit(data.canEdit);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load managed profile policy.");
    } finally {
      setLoading(false);
    }
  }, [apiJson]);

  const loadLastActivity = useCallback(async () => {
    setActivityFetchFailed(false);
    try {
      const data = await apiJson<{ events: ManagedProfileActivityEvent[] }>(
        "/api/dashboard/managed-profiles/activity?limit=1"
      );
      setLastActivity(data.events[0] ?? null);
    } catch {
      setLastActivity(null);
      setActivityFetchFailed(true);
    } finally {
      setActivityLoaded(true);
    }
  }, [apiJson]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadPolicy();
      void loadLastActivity();
    });
  }, [loadPolicy, loadLastActivity]);

  const savePolicy = async (event: FormEvent) => {
    event.preventDefault();
    if (!form || !canEdit) return;
    setSaving(true);
    setSaveMessage("");
    setSaveError("");
    try {
      const payload = {
        enabled: form.enabled,
        timezone: form.timezone,
        workHours: form.workHours,
        duringHoursMode: form.duringHoursMode,
        outsideHoursMode: form.outsideHoursMode,
        defaultMode: form.defaultMode,
        toolModes: Object.fromEntries(
          Object.entries(form.toolModes).filter(([, mode]) => mode !== undefined)
        ),
        protectedRepos: form.protectedRepos
          .filter((repo) => repo.repoHash.trim())
          .map((repo) => ({
            repoHash: repo.repoHash.trim(),
            label: repo.label?.trim() || undefined,
            mode: repo.mode,
            enabled: repo.enabled,
          })),
        pausePolicy: form.pausePolicy,
      };
      const result = await apiJson<{ policy: ManagedProfilePolicy }>("/api/dashboard/managed-profiles", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setForm(result.policy);
      setSaveMessage("Managed profile policy saved.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save managed profile policy.");
    } finally {
      setSaving(false);
    }
  };

  const toggleWorkDay = (day: number) => {
    if (!form) return;
    const days = form.workHours.days.includes(day)
      ? form.workHours.days.filter((value) => value !== day)
      : [...form.workHours.days, day].sort((a, b) => a - b);
    setForm({ ...form, workHours: { ...form.workHours, days } });
  };

  const updateProtectedRepo = (
    index: number,
    patch: Partial<ManagedProfilePolicy["protectedRepos"][number]>
  ) => {
    if (!form) return;
    const protectedRepos = form.protectedRepos.map((repo, repoIndex) =>
      repoIndex === index ? { ...repo, ...patch } : repo
    );
    setForm({ ...form, protectedRepos });
  };

  const runSimulation = async () => {
    setSimulateLoading(true);
    setSimulateError("");
    setSimulateResult(null);
    try {
      const result = await apiJson<PolicySimulationResult>("/api/cli/session-policy/simulate", {
        method: "POST",
        body: JSON.stringify({
          tool: simulateTool,
          repo: simulateRepoHash.trim() || undefined,
          branch: simulateBranch.trim() || undefined,
        }),
      });
      setSimulateResult(result);
    } catch (err) {
      setSimulateError(err instanceof Error ? err.message : "Simulation failed.");
    } finally {
      setSimulateLoading(false);
    }
  };

  if (loading && !form) {
    return <PageLoadingState label="Loading managed profile policy" variant="settings" />;
  }

  if (!form) {
    return (
      <div className="managed-profiles-page">
        <PageHeader
          eyebrow="CLI governance"
          title="Managed profiles"
          description="Control how supported local coding-agent sessions enter workspace policy."
        />
        <DashboardState
          action={<Button onClick={() => void loadPolicy()} type="button" variant="outline">Try again</Button>}
          description={loadError || "Failed to load managed profile policy."}
          kind="error"
          title="Managed profile policy could not be loaded"
        />
      </div>
    );
  }

  const enabledProtectedRepos = form.protectedRepos.filter(
    (repo) => repo.enabled && repo.repoHash.trim()
  );
  const configuredProtectedRepos = form.protectedRepos.filter((repo) => repo.repoHash.trim());
  const repoIsProtected =
    simulateRepoHash.trim().length > 0 &&
    form.protectedRepos.some(
      (repo) => repo.enabled && repo.repoHash === simulateRepoHash.trim()
    );
  const hasProtectedRepos =
    form.protectedRepos.some((repo) => repo.enabled && repo.repoHash.trim()) ?? false;

  const policyStatus = !form.enabled
    ? {
        title: "Managed Profiles disabled",
        detail: "Enable the policy before expecting enforcement.",
      }
    : hasProtectedRepos
      ? {
          title: "Protected repo enforcement configured",
          detail: "At least one enabled repo is protected.",
        }
      : {
          title: "No protected repos",
          detail: "Run a managed tool, then enroll the repo from Activity.",
        };

  const activityStatus = activityFetchFailed
    ? {
        title: "Activity status unavailable",
        detail: "Could not load recent managed profile activity.",
      }
    : lastActivity
      ? {
          title: "Last activity",
          detail: `${activityEventTypeLabel(lastActivity.eventType)} · ${formatRelativeTime(lastActivity.createdAt)}`,
        }
      : {
          title: "No activity yet",
          detail: "Launch a managed tool after installing shims.",
        };

  const workHoursSummary = form.workHours.enabled
    ? `${selectedDaysLabel(form.workHours.days)} · ${form.workHours.start}–${form.workHours.end} ${form.timezone}`
    : "No schedule restriction";

  return (
    <div className="managed-profiles-page">
      <PageHeader
        eyebrow="CLI governance"
        title="Managed profiles"
        description="One workspace policy controls launch-time modes for Claude, Codex, and Cursor shims."
        status={<ProfileStatusBadge enabled={form.enabled} />}
        action={
          <ButtonLink href={href("/dashboard/managed-profiles/activity")} variant="secondary">
            View activity
          </ButtonLink>
        }
        className="managed-profile-header"
      />
      {loading ? <RefreshingIndicator label="Refreshing managed profile policy" /> : null}
      {loadError ? <Alert tone="destructive">The existing policy is still visible, but the latest refresh failed: {loadError}</Alert> : null}

      <dl className="managed-profile-identity-strip" aria-label="Managed profile summary">
        <div>
          <dt>Workspace</dt>
          <dd>{workspaceSlug ?? "Current workspace"}</dd>
        </div>
        <div>
          <dt>CLI targets</dt>
          <dd>3 supported</dd>
        </div>
        <div>
          <dt>Protected repos</dt>
          <dd>{enabledProtectedRepos.length} active · {configuredProtectedRepos.length} configured</dd>
        </div>
        <div>
          <dt>Operating hours</dt>
          <dd>{form.workHours.enabled ? `${form.workHours.start}–${form.workHours.end}` : "Not restricted"}</dd>
        </div>
        <div>
          <dt>Last update</dt>
          <dd>{formatTimestamp(form.updatedAt)}</dd>
        </div>
      </dl>

      <nav className="managed-profile-section-nav" aria-label="Managed profile sections">
        <a href="#managed-profile-overview">Overview</a>
        <a href="#managed-profile-setup">CLI setup</a>
        <a href="#managed-profile-tool-defaults">Tool modes</a>
        <a href="#managed-profile-operating-hours">Operating conditions</a>
        <a href="#managed-profile-protected-repos">Repositories</a>
        <a href="#managed-profile-simulator">Simulator</a>
      </nav>

      {saveMessage ? <p className="setup-banner" role="status">{saveMessage}</p> : null}
      {saveError ? <p className="form-error" role="alert">{saveError}</p> : null}
      {!canEdit ? (
        <DashboardState
          className="managed-profile-restricted"
          description="You can inspect effective modes, setup commands, repository coverage, and activity, but your workspace role cannot save changes."
          kind="access-denied"
          title="Managed profile policy is read-only"
        />
      ) : null}

      <section className="managed-profile-section" id="managed-profile-overview">
        <div className="managed-profile-section-heading">
          <div>
            <p className="ui-kicker">Overview</p>
            <h2>Policy posture</h2>
            <p>See what is configured, how a launch rule is selected, and where the boundary stops.</p>
          </div>
        </div>

        <div className="managed-profile-overview-grid">
          <Card className="managed-profile-posture" padding="medium">
            <div className="managed-profile-posture__header">
              <div>
                <span className="managed-profile-posture__label">Current posture</span>
                <h3>{policyStatus.title}</h3>
              </div>
              <ProfileStatusBadge enabled={form.enabled} />
            </div>
            <p>{policyStatus.detail}</p>
            <dl className="managed-profile-facts">
              <div><dt>Default mode</dt><dd><EnforcementModeBadge mode={form.defaultMode} /></dd></div>
              <div><dt>Rule order</dt><dd>Repository → tool → hours → default</dd></div>
              <div><dt>Pause leases</dt><dd>{form.pausePolicy.enabled ? `Allowed up to ${form.pausePolicy.maxDurationMinutes} minutes` : "Disabled"}</dd></div>
              <div><dt>Required-mode pause</dt><dd>{form.pausePolicy.requireApprovalForRequiredMode ? "Approval required" : "Denied without a matching grant"}</dd></div>
            </dl>
          </Card>

          <aside className="managed-profile-boundary" aria-label="Enforcement boundary">
            <p className="managed-profile-boundary__eyebrow">Enforcement boundary</p>
            <h3>Managed Profiles govern the shim launch path.</h3>
            <p>
              The policy resolves before the real CLI starts. A user who intentionally invokes the
              real binary outside that path is not blocked by the current implementation.
            </p>
            <div className="managed-profile-boundary__cache">
              <strong>Required-mode outage behavior</strong>
              <span>A fresh cached required decision fails closed. Without a valid cache, the current CLI can continue unmanaged.</span>
            </div>
          </aside>
        </div>

        <div className="managed-profile-mode-grid" aria-label="Enforcement mode semantics">
          {MODE_OPTIONS.map((option) => (
            <div className="managed-profile-mode" key={option.value}>
              <EnforcementModeBadge mode={option.value} />
              <p>{MODE_DESCRIPTIONS[option.value]}</p>
            </div>
          ))}
        </div>
      </section>

      <Card
        className="dashboard-panel onboarding-callout managed-profile-onboarding"
        data-testid="managed-profile-onboarding"
        id="managed-profile-setup"
      >
        <div className="managed-profile-onboarding-header">
          <p className="ui-kicker">CLI setup</p>
          <h2>Connect your first managed CLI</h2>
          <p className="managed-profile-onboarding-subtitle">
            Install shims, verify policy, and launch your first managed coding agent.
          </p>
        </div>

        <div className="managed-profile-onboarding-status">
          <div
            className="onboarding-status-chip"
            data-testid="managed-profile-onboarding-policy-hint"
          >
            <span className="onboarding-status-chip__title">{policyStatus.title}</span>
            <span className="onboarding-status-chip__detail">{policyStatus.detail}</span>
          </div>
          {activityLoaded ? (
            <div
              className="onboarding-status-chip"
              data-testid="managed-profile-onboarding-activity-hint"
            >
              <span className="onboarding-status-chip__title">{activityStatus.title}</span>
              <span className="onboarding-status-chip__detail">{activityStatus.detail}</span>
            </div>
          ) : null}
        </div>

        <ol className="managed-profile-onboarding-steps">
          {MANAGED_PROFILE_ONBOARDING_STEPS.map((step, index) => (
            <li className="managed-profile-onboarding-step" key={step.title}>
              <div className="managed-profile-onboarding-step__head">
                <span aria-hidden="true" className="managed-profile-onboarding-step__badge">
                  {index + 1}
                </span>
                <div className="managed-profile-onboarding-step__copy">
                  <h3>{step.title}</h3>
                  <p>{step.summary}</p>
                </div>
              </div>
              <OnboardingCommandGroup commands={step.commands} />
            </li>
          ))}
        </ol>

        <nav aria-label="Managed profile setup links" className="managed-profile-onboarding-actions">
          <Link
            className="managed-profile-onboarding-action"
            data-testid="managed-profile-onboarding-activity-link"
            href={href("/dashboard/managed-profiles/activity")}
          >
            View activity
          </Link>
          <Link className="managed-profile-onboarding-action" href="#managed-profile-simulator">
            Jump to simulator
          </Link>
          <Link className="managed-profile-onboarding-action" href="#managed-profile-protected-repos">
            Protected repos
          </Link>
          <Link className="managed-profile-onboarding-action" href="/docs/cli">
            CLI docs
          </Link>
        </nav>
      </Card>

      <form className="setup-form managed-profile-settings" onSubmit={savePolicy}>
        <section className="managed-profile-section" id="managed-profile-tool-defaults">
          <div className="managed-profile-section-heading">
            <div>
              <p className="ui-kicker">Tool modes</p>
              <h2>Supported CLI targets</h2>
              <p>Set a workspace default or a specific override. Repository and schedule rules still take precedence where configured.</p>
            </div>
            <ModeSelect
              disabled={!canEdit}
              label="Workspace default"
              onChange={(defaultMode) => setForm({ ...form, defaultMode })}
              value={form.defaultMode}
            />
          </div>

          <TableContainer className="managed-profile-table-shell">
            <Table className="managed-profile-table">
              <caption className="sr-only">Managed coding-agent CLI mode configuration</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Target</TableHead>
                  <TableHead>Tool override</TableHead>
                  <TableHead>Effective rule path</TableHead>
                  <TableHead>Repository coverage</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MANAGED_TOOLS.map((tool) => {
                  const override = form.toolModes[tool.id];
                  return (
                    <TableRow key={tool.id} className="managed-profile-tool-row">
                      <TableCell data-label="Target">
                        <strong>{tool.label}</strong>
                        <span>{tool.runtime}</span>
                      </TableCell>
                      <TableCell data-label="Tool override">
                        {override ? <EnforcementModeBadge mode={override} /> : <span className="managed-profile-table__muted">No override</span>}
                      </TableCell>
                      <TableCell data-label="Effective rule path">
                        <span className="managed-profile-rule-path">Protected repo → {override ? "tool override" : form.workHours.enabled ? "hours" : "default"}</span>
                      </TableCell>
                      <TableCell data-label="Repository coverage">
                        <strong className="managed-profile-tabular">{enabledProtectedRepos.length}</strong>
                        <span>enabled rules</span>
                      </TableCell>
                      <TableCell data-label="Action">
                        <label className="managed-profile-tool-select">
                          <span className="sr-only">{tool.label} override</span>
                          <select
                            disabled={!canEdit}
                            onChange={(event) => {
                              const value = event.target.value;
                              setForm({
                                ...form,
                                toolModes: {
                                  ...form.toolModes,
                                  [tool.id]: value ? (value as PolicyMode) : undefined,
                                },
                              });
                            }}
                            value={override ?? ""}
                          >
                            <option value="">Use default / work-hours rules</option>
                            {MODE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <p className="managed-profile-scope-note">
            Managed Profiles store launch modes for these three CLIs. They do not store allowed-tool
            lists or denied-command rules; review an agent&apos;s Permissions tab for any stored command constraints.
          </p>
        </section>

        <section className="managed-profile-section" id="managed-profile-operating-hours">
          <div className="managed-profile-section-heading">
            <div>
              <p className="ui-kicker">Operating conditions</p>
              <h2>Policy availability and schedule</h2>
              <p>Control whether the persisted policy participates in resolution and how modes change across working hours.</p>
            </div>
          </div>

          <div className="managed-profile-editor-grid">
            <Card className="managed-profile-editor-panel" padding="medium">
              <div className="managed-profile-editor-panel__header">
                <div><h3>Policy status</h3><p>Disabling this policy returns resolution to legacy onboarding-derived behavior.</p></div>
                <ProfileStatusBadge enabled={form.enabled} />
              </div>
              <label className="setup-check managed-profile-toggle">
                <input
                  checked={form.enabled}
                  disabled={!canEdit}
                  onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
                  type="checkbox"
                />
                <span>Enable managed profile policy for this workspace</span>
              </label>
              <p className="managed-profile-editor-note">
                When disabled, CLI shims fall back to existing onboarding-based policy behavior.
              </p>
            </Card>

            <Card className="managed-profile-editor-panel" padding="medium">
              <div className="managed-profile-editor-panel__header">
                <div><h3>Work hours</h3><p>{workHoursSummary}</p></div>
                <EnforcementModeBadge mode={form.workHours.enabled ? form.duringHoursMode : form.defaultMode} />
              </div>
              <label className="setup-check managed-profile-toggle">
                <input
                  checked={form.workHours.enabled}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      workHours: { ...form.workHours, enabled: event.target.checked },
                    })
                  }
                  type="checkbox"
                />
                <span>Apply work-hours rules</span>
              </label>
              <label>
                <span>Timezone</span>
                <input
                  disabled={!canEdit}
                  list="managed-profile-timezones"
                  onChange={(event) => setForm({ ...form, timezone: event.target.value })}
                  value={form.timezone}
                />
                <datalist id="managed-profile-timezones">
                  {COMMON_TIMEZONES.map((timezone) => (
                    <option key={timezone} value={timezone} />
                  ))}
                </datalist>
              </label>
              <fieldset className="setup-fieldset">
                <legend>Work days</legend>
                <div className="setup-checkgrid managed-profile-day-grid">
                  {WEEKDAYS.map((day) => (
                    <label className="setup-check" key={day.value}>
                      <input
                        checked={form.workHours.days.includes(day.value)}
                        disabled={!canEdit}
                        onChange={() => toggleWorkDay(day.value)}
                        type="checkbox"
                      />
                      <span>{day.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="setup-form__row managed-profile-time-grid">
                <label>
                  <span>Start</span>
                  <input
                    disabled={!canEdit}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        workHours: { ...form.workHours, start: event.target.value },
                      })
                    }
                    type="time"
                    value={form.workHours.start}
                  />
                </label>
                <label>
                  <span>End</span>
                  <input
                    disabled={!canEdit}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        workHours: { ...form.workHours, end: event.target.value },
                      })
                    }
                    type="time"
                    value={form.workHours.end}
                  />
                </label>
              </div>
              <div className="managed-profile-mode-fields">
                <ModeSelect
                  disabled={!canEdit}
                  label="During work hours"
                  onChange={(duringHoursMode) => setForm({ ...form, duringHoursMode })}
                  value={form.duringHoursMode}
                />
                <ModeSelect
                  disabled={!canEdit}
                  label="Outside work hours"
                  onChange={(outsideHoursMode) => setForm({ ...form, outsideHoursMode })}
                  value={form.outsideHoursMode}
                />
              </div>
            </Card>
          </div>
        </section>

        <section className="managed-profile-section" id="managed-profile-protected-repos">
          <div className="managed-profile-section-heading managed-profile-section-heading--repos">
            <div>
              <p className="ui-kicker">Repositories</p>
              <h2>Protected repositories</h2>
              <p>Repository rules are evaluated before tool, work-hours, and default modes.</p>
            </div>
            {canEdit ? (
              <Button
                onClick={() =>
                  setForm({ ...form, protectedRepos: [...form.protectedRepos, emptyProtectedRepo()] })
                }
                type="button"
                variant="secondary"
              >
                Add protected repo
              </Button>
            ) : null}
          </div>

          <div className="managed-profile-repo-help">
            <p>
              Add policy repo hashes shown by <code>behalf profile status --tool claude</code> or{" "}
              <code>behalf profile doctor</code>. Hashes are derived from the git remote when available,
              otherwise the local repo root.
            </p>
            <p>
              You can also add protected repos from{" "}
              <Link href={href("/dashboard/managed-profiles/activity")}>
                Managed Profile Activity
              </Link>{" "}
              after running <code>behalf profile status</code> or launching a managed tool.
            </p>
          </div>

          {form.protectedRepos.length ? (
            <TableContainer className="managed-profile-table-shell managed-profile-repo-table-shell">
              <Table className="managed-profile-table managed-profile-repo-table">
                <caption className="sr-only">Protected repository configuration</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Repository hash</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {form.protectedRepos.map((repo, index) => (
                    <TableRow className="protected-repo-row" key={`repo-${index}`}>
                      <TableCell data-label="Repository hash">
                        <label>
                          <span className="sr-only">Repo hash</span>
                          <input
                            disabled={!canEdit}
                            onChange={(event) => updateProtectedRepo(index, { repoHash: event.target.value })}
                            placeholder="16-char hash"
                            value={repo.repoHash}
                          />
                        </label>
                      </TableCell>
                      <TableCell data-label="Label">
                        <label>
                          <span className="sr-only">Label</span>
                          <input
                            disabled={!canEdit}
                            onChange={(event) => updateProtectedRepo(index, { label: event.target.value })}
                            placeholder="Production monorepo"
                            value={repo.label ?? ""}
                          />
                        </label>
                      </TableCell>
                      <TableCell data-label="Mode">
                        <label>
                          <span className="sr-only">Mode</span>
                          <select
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateProtectedRepo(index, { mode: event.target.value as PolicyMode })
                            }
                            value={repo.mode}
                          >
                            {MODE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </TableCell>
                      <TableCell data-label="Status">
                        <div className="managed-profile-repo-status">
                          <ProtectedRepositoryStatusBadge
                            state={protectedRepositoryState(form.enabled, repo.enabled)}
                          />
                          <label className="setup-check">
                            <input
                              checked={repo.enabled}
                              disabled={!canEdit}
                              onChange={(event) => updateProtectedRepo(index, { enabled: event.target.checked })}
                              type="checkbox"
                            />
                            <span>Enabled</span>
                          </label>
                        </div>
                      </TableCell>
                      <TableCell data-label="Action">
                        {canEdit ? (
                          <Button
                            onClick={() =>
                              setForm({
                                ...form,
                                protectedRepos: form.protectedRepos.filter((_, repoIndex) => repoIndex !== index),
                              })
                            }
                            type="button"
                            variant="secondary"
                          >
                            Remove
                          </Button>
                        ) : <span className="managed-profile-table__muted">Read-only</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <EmptyState className="managed-profile-repo-empty">
              <p className="managed-profile-repo-empty__title">No protected repositories</p>
              <p>Run a managed CLI from a repository, then enroll its policy hash from Activity.</p>
              <ButtonLink href={href("/dashboard/managed-profiles/activity")} variant="outline">
                Open activity
              </ButtonLink>
            </EmptyState>
          )}
        </section>

        <section className="managed-profile-section">
          <div className="managed-profile-section-heading">
            <div>
              <p className="ui-kicker">Pause controls</p>
              <h2>Temporary policy pauses</h2>
              <p>Configure whether local users may request a lease that temporarily resolves the current context as unmanaged.</p>
            </div>
          </div>

          <Card className="managed-profile-pause-panel" padding="medium">
            <div className="managed-profile-pause-controls">
              <label className="setup-check managed-profile-toggle">
                <input
                  checked={form.pausePolicy.enabled}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      pausePolicy: { ...form.pausePolicy, enabled: event.target.checked },
                    })
                  }
                  type="checkbox"
                />
                <span>Allow pause leases</span>
              </label>
              <label className="setup-check managed-profile-toggle">
                <input
                  checked={form.pausePolicy.reasonRequired}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      pausePolicy: { ...form.pausePolicy, reasonRequired: event.target.checked },
                    })
                  }
                  type="checkbox"
                />
                <span>Require reason</span>
              </label>
              <label className="setup-check managed-profile-toggle">
                <input
                  checked={form.pausePolicy.allowAllRepos}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      pausePolicy: { ...form.pausePolicy, allowAllRepos: event.target.checked },
                    })
                  }
                  type="checkbox"
                />
                <span>Allow all-repos pause scope</span>
              </label>
              <label className="managed-profile-duration">
                <span>Max duration (minutes)</span>
                <input
                  disabled={!canEdit}
                  max={240}
                  min={1}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      pausePolicy: {
                        ...form.pausePolicy,
                        maxDurationMinutes: Number(event.target.value),
                      },
                    })
                  }
                  type="number"
                  value={form.pausePolicy.maxDurationMinutes}
                />
              </label>
            </div>
            <div className="managed-profile-required-pause">
              <span>Required-mode approval</span>
              <strong>{form.pausePolicy.requireApprovalForRequiredMode ? "Required" : "Not enabled"}</strong>
              <p>
                {form.pausePolicy.requireApprovalForRequiredMode
                  ? "A matching dashboard approval must be consumed before the required context receives a pause lease."
                  : "Required contexts deny pause requests unless current policy behavior provides a matching grant."}
              </p>
            </div>
          </Card>
        </section>

        <Card
          className="dashboard-panel managed-profile-simulator"
          data-testid="managed-profile-simulator"
          id="managed-profile-simulator"
        >
          <div className="managed-profile-section-heading">
            <div>
              <p className="ui-kicker">Verification</p>
              <h2>Policy simulator</h2>
              <p>Dry-run the effective decision without launching a tool or creating pause leases.</p>
            </div>
          </div>
          <div className="managed-profile-simulator__fields">
            <label>
              <span>Tool</span>
              <select
                data-testid="simulator-tool-select"
                onChange={(event) =>
                  setSimulateTool(event.target.value as "claude" | "codex" | "cursor")
                }
                value={simulateTool}
              >
                <option value="claude">Claude</option>
                <option value="codex">Codex</option>
                <option value="cursor">Cursor</option>
              </select>
            </label>
            <label>
              <span>Repo hash</span>
              <input
                data-testid="simulator-repo-hash"
                onChange={(event) => setSimulateRepoHash(event.target.value)}
                placeholder="16-char policy repo hash"
                value={simulateRepoHash}
              />
            </label>
            <label>
              <span>Branch</span>
              <input
                onChange={(event) => setSimulateBranch(event.target.value)}
                placeholder="main"
                value={simulateBranch}
              />
            </label>
            <Button disabled={simulateLoading} onClick={() => void runSimulation()} type="button">
              {simulateLoading ? "Simulating…" : "Simulate"}
            </Button>
          </div>
          {simulateError ? <p className="form-error" role="alert">{simulateError}</p> : null}
          {simulateResult ? (
            <div className="managed-profile-simulator__result" data-testid="simulator-result">
              <div className="managed-profile-simulator__decision">
                <span data-testid="simulator-result-mode">Effective mode</span>
                <EnforcementModeBadge mode={simulateResult.mode} />
              </div>
              <dl>
                <div data-testid="simulator-result-reason"><dt>Reason</dt><dd>{simulateResult.reason}</dd></div>
                <div><dt>Matched rule</dt><dd>{simulateResult.matchedRule?.type ?? "(none)"}</dd></div>
                <div><dt>Pause policy</dt><dd>{simulateResult.pausePolicy.enabled ? "Enabled" : "Disabled"} · max {simulateResult.pausePolicy.maxDurationMinutes}m · approval for required mode {simulateResult.pausePolicy.requireApprovalForRequiredMode ? "required" : "not required"}</dd></div>
              </dl>
              {simulateRepoHash.trim() && !repoIsProtected ? (
                <p className="managed-profile-simulator__notice">
                  This repo hash is not enrolled as a protected repo. Add it under Protected repos or
                  use{" "}
                  <Link href={href("/dashboard/managed-profiles/activity")}>
                    Managed Profile Activity
                  </Link>{" "}
                  to enroll from recent CLI activity.
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>

        <div className="managed-profile-savebar">
          <div>
            <strong>{canEdit ? "Review the full policy before saving" : "Read-only policy"}</strong>
            <span>{canEdit ? "Saving updates the existing workspace policy; it does not install or remove local shims." : "Your workspace role cannot mutate this policy."}</span>
          </div>
          {canEdit ? (
            <Button disabled={saving} type="submit" variant="primary">
              {saving ? "Saving…" : "Save policy"}
            </Button>
          ) : (
            <p className="ops-empty">You have read-only access to managed profile policy.</p>
          )}
        </div>
      </form>
    </div>
  );
}
