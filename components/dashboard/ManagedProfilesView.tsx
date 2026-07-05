"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, ButtonLink, Card, PageHeader } from "@/components/ui";

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

  useEffect(() => {
    void loadPolicy();
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

      <form className="setup-form" onSubmit={savePolicy}>
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

        <Card className="dashboard-panel">
          <div className="dashboard-section-header">
            <h2>Protected repos</h2>
          </div>
          <p className="ops-empty">
            Add policy repo hashes shown by <code>behalf profile status --tool claude</code> or{" "}
            <code>behalf profile doctor</code>. Hashes are derived from the git remote when available,
            otherwise the local repo root. Protected repo rules take precedence over tool and work-hours
            settings.
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
