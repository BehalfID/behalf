"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Button, ButtonLink, Card, PageHeader } from "@/components/ui";
import { haptic } from "@/lib/haptic";
import type { ManagedProfileActivityEvent } from "@/lib/cliAuditActivityTypes";
import { MANAGED_PROFILE_ONBOARDING_STEPS } from "@/lib/managedProfileOnboarding";

type PolicyMode = "unmanaged" | "managed" | "required";

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

function activityEventTypeLabel(eventType: ManagedProfileActivityEvent["eventType"]) {
  return ACTIVITY_EVENT_TYPE_LABELS[eventType] ?? eventType;
}

function OnboardingCompactCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(command).then(() => {
      haptic("success");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="onboarding-command-row">
      <code className="onboarding-command-row__text">{command}</code>
      <button
        type="button"
        className={["onboarding-command-row__copy", copied ? "onboarding-command-row__copy--ok" : ""]
          .filter(Boolean)
          .join(" ")}
        onClick={copy}
        aria-label={`Copy ${command}`}
      >
        {copied ? "Copied" : "Copy"}
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function emptyProtectedRepo() {
  return { repoHash: "", label: "", mode: "required" as PolicyMode, enabled: true };
}

export function ManagedProfilesView() {
  const [loading, setLoading] = useState(true);
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

  const loadPolicy = async () => {
    setLoading(true);
    setSaveError("");
    try {
      const data = await api<ManagedProfilesResponse>("/api/dashboard/managed-profiles");
      setForm(data.policy);
      setCanEdit(data.canEdit);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to load managed profile policy.");
    } finally {
      setLoading(false);
    }
  };

  const loadLastActivity = async () => {
    try {
      const data = await api<{ events: ManagedProfileActivityEvent[] }>(
        "/api/dashboard/managed-profiles/activity?limit=1"
      );
      setLastActivity(data.events[0] ?? null);
    } catch {
      setLastActivity(null);
    } finally {
      setActivityLoaded(true);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      void loadPolicy();
      void loadLastActivity();
    });
  }, []);

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
      const result = await api<{ policy: ManagedProfilePolicy }>("/api/dashboard/managed-profiles", {
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
      const result = await api<PolicySimulationResult>("/api/cli/session-policy/simulate", {
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

  const repoIsProtected =
    simulateRepoHash.trim().length > 0 &&
    form?.protectedRepos.some(
      (repo) => repo.enabled && repo.repoHash === simulateRepoHash.trim()
    );

  const hasProtectedRepos =
    form?.protectedRepos.some((repo) => repo.enabled && repo.repoHash.trim()) ?? false;

  const policyStatus = !form?.enabled
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

  const activityStatus = lastActivity
    ? {
        title: "Last activity",
        detail: `${activityEventTypeLabel(lastActivity.eventType)} · ${formatRelativeTime(lastActivity.createdAt)}`,
      }
    : {
        title: "No activity yet",
        detail: "Launch a managed tool after installing shims.",
      };

  if (loading && !form) {
    return <p className="setup-loading">Loading managed profile policy…</p>;
  }

  if (!form) {
    return (
      <>
        <PageHeader
          title="Managed profiles"
          description="Control when local coding agents run unmanaged, managed, or required."
        />
        {saveError ? <p className="form-error" role="alert">{saveError}</p> : null}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Managed profiles"
        description="Control when local coding agents run unmanaged, managed, or required."
        action={
          <ButtonLink href="/dashboard/managed-profiles/activity" variant="secondary">
            View activity
          </ButtonLink>
        }
      />
      {saveMessage ? <p className="setup-banner" role="status">{saveMessage}</p> : null}
      {saveError ? <p className="form-error" role="alert">{saveError}</p> : null}

      <Card
        className="dashboard-panel onboarding-callout managed-profile-onboarding"
        data-testid="managed-profile-onboarding"
      >
        <div className="managed-profile-onboarding-header">
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
            href="/dashboard/managed-profiles/activity"
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

      <Card
        className="dashboard-panel"
        data-testid="managed-profile-simulator"
        id="managed-profile-simulator"
      >
        <div className="dashboard-section-header">
          <h2>Policy simulator</h2>
        </div>
        <p className="ops-empty">
          Dry-run the effective managed profile decision for a tool, repo hash, and branch without
          launching a tool or creating pause leases.
        </p>
        <div className="setup-form__row">
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
        </div>
        <Button disabled={simulateLoading} onClick={() => void runSimulation()} type="button">
          {simulateLoading ? "Simulating…" : "Simulate"}
        </Button>
        {simulateError ? <p className="form-error" role="alert">{simulateError}</p> : null}
        {simulateResult ? (
          <div className="dashboard-panel" data-testid="simulator-result">
            <p>
              <strong data-testid="simulator-result-mode">Mode:</strong> {simulateResult.mode}
            </p>
            <p data-testid="simulator-result-reason">
              <strong>Reason:</strong> {simulateResult.reason}
            </p>
            <p>
              <strong>Matched rule:</strong> {simulateResult.matchedRule?.type ?? "(none)"}
            </p>
            <p>
              <strong>Pause policy:</strong>{" "}
              {simulateResult.pausePolicy.enabled ? "enabled" : "disabled"},{" "}
              max {simulateResult.pausePolicy.maxDurationMinutes}m, approval for required mode:{" "}
              {simulateResult.pausePolicy.requireApprovalForRequiredMode ? "yes" : "no"}
            </p>
            {simulateRepoHash.trim() && !repoIsProtected ? (
              <p className="ops-empty">
                This repo hash is not enrolled as a protected repo. Add it under Protected repos or
                use{" "}
                <Link href="/dashboard/managed-profiles/activity">Managed Profile Activity</Link> to
                enroll from recent CLI activity.
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>

      <form className="setup-form managed-profile-settings" onSubmit={savePolicy}>
        <Card className="dashboard-panel">
          <div className="dashboard-section-header">
            <h2>Policy enabled</h2>
          </div>
          <label className="setup-check">
            <input
              checked={form.enabled}
              disabled={!canEdit}
              onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
              type="checkbox"
            />
            <span>Enable managed profile policy for this workspace</span>
          </label>
          <p className="ops-empty">
            When disabled, CLI shims fall back to existing onboarding-based policy behavior.
          </p>
        </Card>

        <Card className="dashboard-panel">
          <div className="dashboard-section-header">
            <h2>Work hours</h2>
          </div>
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
          <label className="setup-check">
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
          <fieldset className="setup-fieldset">
            <legend>Work days</legend>
            <div className="setup-checkgrid">
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
          <div className="setup-form__row">
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
          <label>
            <span>During work hours</span>
            <select
              disabled={!canEdit}
              onChange={(event) =>
                setForm({ ...form, duringHoursMode: event.target.value as PolicyMode })
              }
              value={form.duringHoursMode}
            >
              {MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Outside work hours</span>
            <select
              disabled={!canEdit}
              onChange={(event) =>
                setForm({ ...form, outsideHoursMode: event.target.value as PolicyMode })
              }
              value={form.outsideHoursMode}
            >
              {MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </Card>

        <Card className="dashboard-panel">
          <div className="dashboard-section-header">
            <h2>Tool defaults</h2>
          </div>
          <label>
            <span>Default mode</span>
            <select
              disabled={!canEdit}
              onChange={(event) => setForm({ ...form, defaultMode: event.target.value as PolicyMode })}
              value={form.defaultMode}
            >
              {MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {(["claude", "codex", "cursor"] as const).map((tool) => (
            <label key={tool}>
              <span>{tool[0].toUpperCase() + tool.slice(1)} override</span>
              <select
                disabled={!canEdit}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm({
                    ...form,
                    toolModes: {
                      ...form.toolModes,
                      [tool]: value ? (value as PolicyMode) : undefined,
                    },
                  });
                }}
                value={form.toolModes[tool] ?? ""}
              >
                <option value="">Use default / work-hours rules</option>
                {MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </Card>

        <Card className="dashboard-panel" id="managed-profile-protected-repos">
          <div className="dashboard-section-header">
            <h2>Protected repos</h2>
          </div>
          <p className="ops-empty">
            Add policy repo hashes shown by <code>behalf profile status --tool claude</code> or{" "}
            <code>behalf profile doctor</code>. Hashes are derived from the git remote when available,
            otherwise the local repo root. Protected repo rules take precedence over tool and work-hours
            settings.
          </p>
          <p className="ops-empty">
            You can also add protected repos from{" "}
            <Link href="/dashboard/managed-profiles/activity">Managed Profile Activity</Link> after running{" "}
            <code>behalf profile status</code> or launching a managed tool.
          </p>
          {form.protectedRepos.map((repo, index) => (
            <div className="setup-form__row protected-repo-row" key={`repo-${index}`}>
              <label>
                <span>Repo hash</span>
                <input
                  disabled={!canEdit}
                  onChange={(event) => updateProtectedRepo(index, { repoHash: event.target.value })}
                  placeholder="16-char hash"
                  value={repo.repoHash}
                />
              </label>
              <label>
                <span>Label</span>
                <input
                  disabled={!canEdit}
                  onChange={(event) => updateProtectedRepo(index, { label: event.target.value })}
                  placeholder="Production monorepo"
                  value={repo.label ?? ""}
                />
              </label>
              <label>
                <span>Mode</span>
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
              <label className="setup-check">
                <input
                  checked={repo.enabled}
                  disabled={!canEdit}
                  onChange={(event) => updateProtectedRepo(index, { enabled: event.target.checked })}
                  type="checkbox"
                />
                <span>Enabled</span>
              </label>
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
              ) : null}
            </div>
          ))}
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
        </Card>

        <Card className="dashboard-panel">
          <div className="dashboard-section-header">
            <h2>Pause policy</h2>
          </div>
          <label className="setup-check">
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
          <label className="setup-check">
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
          <label>
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
          <label className="setup-check">
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
        </Card>

        {canEdit ? (
          <Button disabled={saving} type="submit" variant="primary">
            {saving ? "Saving…" : "Save policy"}
          </Button>
        ) : (
          <p className="ops-empty">You have read-only access to managed profile policy.</p>
        )}
      </form>
    </>
  );
}
