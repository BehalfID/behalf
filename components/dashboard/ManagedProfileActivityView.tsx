"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button, ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import {
  activitySummaryFromEvents,
  type ManagedProfileActivityEvent,
} from "@/lib/cliAuditActivityTypes";
import { formatOpsTime } from "./opsLogTypes";

type PolicyMode = "unmanaged" | "managed" | "required";

type ActivityResponse = {
  events: ManagedProfileActivityEvent[];
  nextCursor: string | null;
};

type ManagedProfilesResponse = {
  policy: {
    enabled: boolean;
    protectedRepos: Array<{
      repoHash: string;
      enabled?: boolean;
    }>;
  };
  canEdit: boolean;
};

type ProtectedRepoStatus = "enforced" | "disabled-entry" | "policy-disabled";

type EnrollTarget = {
  repoHash: string;
};

const EVENT_TYPE_LABELS: Record<ManagedProfileActivityEvent["eventType"], string> = {
  cli_session_policy: "Session policy",
  cli_pause_grant: "Pause grant",
  cli_pause_deny: "Pause denial",
  cli_pause_approval_requested: "Pause approval requested",
};

const MODE_OPTIONS: Array<{ value: PolicyMode; label: string }> = [
  { value: "unmanaged", label: "Unmanaged" },
  { value: "managed", label: "Managed" },
  { value: "required", label: "Required" },
];

async function fetchActivity(path: string): Promise<ActivityResponse> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed with ${response.status}`);
  }
  return response.json() as Promise<ActivityResponse>;
}

async function fetchManagedProfiles(): Promise<ManagedProfilesResponse> {
  const response = await fetch("/api/dashboard/managed-profiles", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed with ${response.status}`);
  }
  return response.json() as Promise<ManagedProfilesResponse>;
}

function eventTypeLabel(eventType: ManagedProfileActivityEvent["eventType"]) {
  return EVENT_TYPE_LABELS[eventType] ?? eventType;
}

function modeLabel(mode: ManagedProfileActivityEvent["mode"]) {
  if (!mode) return "—";
  return mode[0].toUpperCase() + mode.slice(1);
}

function formatActivityRepo(event: ManagedProfileActivityEvent) {
  if (event.pauseScope === "all") return "all repos";
  return event.repo ?? "—";
}

function formatActivityPauseMeta(event: ManagedProfileActivityEvent) {
  const parts: string[] = [];
  if (typeof event.requestedDurationMinutes === "number") {
    parts.push(`Duration ${event.requestedDurationMinutes}m`);
  }
  if (event.deviceId) parts.push(`Device ${event.deviceId}`);
  return parts.join(" · ");
}

function buildProtectedRepoStatusByHash(
  policy: ManagedProfilesResponse["policy"]
): Map<string, ProtectedRepoStatus> {
  const status = new Map<string, ProtectedRepoStatus>();
  for (const repo of policy.protectedRepos) {
    if (!policy.enabled) {
      status.set(repo.repoHash, "policy-disabled");
    } else if (repo.enabled === false) {
      status.set(repo.repoHash, "disabled-entry");
    } else {
      status.set(repo.repoHash, "enforced");
    }
  }
  return status;
}

type ProtectRepoActionsProps = {
  repoHash: string | null | undefined;
  canEdit: boolean;
  protectedRepoStatusByHash: Map<string, ProtectedRepoStatus>;
  onProtect: (repoHash: string) => void;
};

function ProtectRepoActions({
  repoHash,
  canEdit,
  protectedRepoStatusByHash,
  onProtect,
}: ProtectRepoActionsProps) {
  if (!repoHash) return <>—</>;

  const status = protectedRepoStatusByHash.get(repoHash);

  if (status === "enforced") {
    return <span className="ops-status ops-status--allowed">Protected</span>;
  }

  if (status === "disabled-entry") {
    return (
      <>
        <span className="ops-status ops-status--neutral">Disabled in policy</span>{" "}
        <Link href="/dashboard/managed-profiles">Edit policy</Link>
      </>
    );
  }

  if (status === "policy-disabled") {
    return (
      <>
        <span className="ops-status ops-status--neutral">Policy disabled</span>{" "}
        <Link href="/dashboard/managed-profiles">Edit policy</Link>
      </>
    );
  }

  if (!canEdit) return <>—</>;

  return (
    <Button onClick={() => onProtect(repoHash)} type="button" variant="secondary">
      Protect repo
    </Button>
  );
}

type ActivityEventCardProps = {
  event: ManagedProfileActivityEvent;
  canEdit: boolean;
  protectedRepoStatusByHash: Map<string, ProtectedRepoStatus>;
  onProtect: (repoHash: string) => void;
};

function ActivityEventCard({
  event,
  canEdit,
  protectedRepoStatusByHash,
  onProtect,
}: ActivityEventCardProps) {
  return (
    <article className="ops-event-card ops-event-card--static managed-activity-card">
      <div className="ops-event-card__head">
        <time className="ops-event-card__time" dateTime={event.createdAt}>
          {formatOpsTime(event.createdAt)}
        </time>
        <span className="ops-status ops-status--neutral">
          <span className="ops-status__label">{eventTypeLabel(event.eventType)}</span>
        </span>
      </div>
      <p className="ops-event-card__primary">
        <span className="ops-event-card__agent">{event.tool ?? "—"}</span>
        <span className="ops-event-card__sep">·</span>
        <span>{modeLabel(event.mode)}</span>
      </p>
      <p className="ops-event-card__meta">
        Repo {formatActivityRepo(event)} · Branch {event.branch ?? "—"}
      </p>
      <p className="ops-event-card__reason">{event.reason}</p>
      {formatActivityPauseMeta(event) ? (
        <p className="ops-event-card__meta">{formatActivityPauseMeta(event)}</p>
      ) : event.deviceId ? (
        <p className="ops-event-card__meta">
          Device <code>{event.deviceId}</code>
        </p>
      ) : null}
      {event.approvalRequestId ? (
        <p className="ops-event-card__meta">
          <Link href={`/dashboard/approvals?highlight=${event.approvalRequestId}`}>
            View approval {event.approvalRequestId}
          </Link>
        </p>
      ) : null}
      {event.repo ? (
        <p className="ops-event-card__meta">
          <ProtectRepoActions
            canEdit={canEdit}
            onProtect={onProtect}
            protectedRepoStatusByHash={protectedRepoStatusByHash}
            repoHash={event.repo}
          />
        </p>
      ) : null}
    </article>
  );
}

export function ManagedProfileActivityView() {
  const [tool, setTool] = useState("");
  const [mode, setMode] = useState("");
  const [eventType, setEventType] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [range, setRange] = useState("");
  const [events, setEvents] = useState<ManagedProfileActivityEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [protectedRepoStatusByHash, setProtectedRepoStatusByHash] = useState<
    Map<string, ProtectedRepoStatus>
  >(() => new Map());
  const [enrollTarget, setEnrollTarget] = useState<EnrollTarget | null>(null);
  const [enrollLabel, setEnrollLabel] = useState("");
  const [enrollMode, setEnrollMode] = useState<PolicyMode>("required");
  const [enrollError, setEnrollError] = useState("");
  const [enrollMessage, setEnrollMessage] = useState("");
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);

  const buildActivityPath = useCallback(() => {
    const params = new URLSearchParams();
    params.set("limit", "25");
    if (tool) params.set("tool", tool);
    if (mode) params.set("mode", mode);
    if (eventType) params.set("eventType", eventType);
    if (repo.trim()) params.set("repo", repo.trim());
    if (branch.trim()) params.set("branch", branch.trim());
    if (range === "24h") params.set("from", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if (range === "7d") params.set("from", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    return `/api/dashboard/managed-profiles/activity?${params.toString()}`;
  }, [branch, eventType, mode, range, repo, tool]);

  const loadPolicy = useCallback(async () => {
    try {
      const response = await fetchManagedProfiles();
      setCanEdit(response.canEdit);
      setProtectedRepoStatusByHash(buildProtectedRepoStatusByHash(response.policy));
    } catch {
      setCanEdit(false);
      setProtectedRepoStatusByHash(new Map());
    }
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchActivity(buildActivityPath());
      setEvents(response.events);
      setNextCursor(response.nextCursor);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed.");
      setEvents([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [buildActivityPath]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const basePath = buildActivityPath();
      const separator = basePath.includes("?") ? "&" : "?";
      const response = await fetchActivity(`${basePath}${separator}cursor=${encodeURIComponent(nextCursor)}`);
      setEvents((current) => [...current, ...response.events]);
      setNextCursor(response.nextCursor);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed.");
    } finally {
      setLoadingMore(false);
    }
  }, [buildActivityPath, loadingMore, nextCursor]);

  const openEnrollForm = useCallback((repoHash: string) => {
    setEnrollTarget({ repoHash });
    setEnrollLabel("");
    setEnrollMode("required");
    setEnrollError("");
    setEnrollMessage("");
  }, []);

  const closeEnrollForm = useCallback(() => {
    setEnrollTarget(null);
    setEnrollError("");
  }, []);

  const submitEnroll = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!enrollTarget) return;

      setEnrollSubmitting(true);
      setEnrollError("");
      setEnrollMessage("");
      try {
        const response = await fetch("/api/dashboard/managed-profiles/protected-repos", {
          method: "POST",
          credentials: "include",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repoHash: enrollTarget.repoHash,
            label: enrollLabel.trim() || undefined,
            mode: enrollMode,
            enabled: true,
          }),
        });
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          policy?: ManagedProfilesResponse["policy"];
        } | null;
        if (!response.ok) {
          throw new Error(body?.error ?? `Request failed with ${response.status}`);
        }
        if (!body?.policy) {
          throw new Error("Response missing managed profile policy.");
        }

        setProtectedRepoStatusByHash(buildProtectedRepoStatusByHash(body.policy));
        setEnrollMessage("Protected repo added to managed profile policy.");
        setEnrollTarget(null);
      } catch (requestError) {
        setEnrollError(requestError instanceof Error ? requestError.message : "Request failed.");
      } finally {
        setEnrollSubmitting(false);
      }
    },
    [enrollLabel, enrollMode, enrollTarget]
  );

  useEffect(() => {
    queueMicrotask(() => void loadPolicy());
  }, [loadPolicy]);

  useEffect(() => {
    queueMicrotask(() => void reload());
  }, [reload]);

  const summary = activitySummaryFromEvents(events);
  const hasFilters = Boolean(tool || mode || eventType || repo || branch || range);

  return (
    <div className="ops-console managed-activity-console">
      <PageHeader
        title="Managed profile activity"
        description="See local coding-agent policy decisions and pause events."
        action={
          <ButtonLink href="/dashboard/managed-profiles" variant="secondary">
            Edit managed profile policy
          </ButtonLink>
        }
        className="dashboard-header ops-console__header"
      />

      <div className="ops-metrics" aria-label="Activity summary">
        <span className="ops-metrics__item">
          <strong>{summary.requiredDecisions}</strong> required decisions
        </span>
        <span className="ops-metrics__item">
          <strong>{summary.managedDecisions}</strong> managed decisions
        </span>
        <span className="ops-metrics__item ops-metrics__item--allowed">
          <strong>{summary.pauseGrants}</strong> pause grants
        </span>
        <span className="ops-metrics__item ops-metrics__item--denied">
          <strong>{summary.pauseDenials}</strong> pause denials
        </span>
        <span className="ops-metrics__item">
          <strong>{summary.pauseApprovalRequests}</strong> pause approval requests
        </span>
      </div>

      <div className="ops-cmd" role="search">
        <div className="ops-cmd__filters">
          <select
            className="ops-cmd__filter"
            aria-label="Tool filter"
            value={tool}
            onChange={(event) => setTool(event.target.value)}
          >
            <option value="">Tool</option>
            <option value="claude">Claude</option>
            <option value="codex">Codex</option>
            <option value="cursor">Cursor</option>
          </select>
          <select
            className="ops-cmd__filter"
            aria-label="Mode filter"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="">Mode</option>
            <option value="unmanaged">Unmanaged</option>
            <option value="managed">Managed</option>
            <option value="required">Required</option>
          </select>
          <select
            className="ops-cmd__filter"
            aria-label="Event type filter"
            value={eventType}
            onChange={(event) => setEventType(event.target.value)}
          >
            <option value="">Event type</option>
            <option value="cli_session_policy">Session policy</option>
            <option value="cli_pause_grant">Pause grant</option>
            <option value="cli_pause_deny">Pause denial</option>
            <option value="cli_pause_approval_requested">Pause approval requested</option>
          </select>
          <input
            className="ops-cmd__filter"
            aria-label="Repo hash filter"
            placeholder="Repo hash"
            value={repo}
            onChange={(event) => setRepo(event.target.value)}
          />
          <input
            className="ops-cmd__filter"
            aria-label="Branch filter"
            placeholder="Branch"
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
          />
          <select
            className="ops-cmd__filter"
            aria-label="Time range filter"
            value={range}
            onChange={(event) => setRange(event.target.value)}
          >
            <option value="">Range</option>
            <option value="24h">24h</option>
            <option value="7d">7d</option>
          </select>
          <button type="button" className="ops-btn ops-btn--ghost ops-cmd__refresh" onClick={() => void reload()}>
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {enrollMessage ? (
        <p className="setup-banner" role="status">
          {enrollMessage}
        </p>
      ) : null}

      {enrollTarget ? (
        <form className="setup-form managed-activity-enroll" onSubmit={(event) => void submitEnroll(event)}>
          <div className="dashboard-section-header">
            <h2>Protect repo</h2>
          </div>
          <label>
            <span>Repo hash</span>
            <input readOnly value={enrollTarget.repoHash} />
          </label>
          <label>
            <span>Label</span>
            <input
              autoFocus
              onChange={(event) => setEnrollLabel(event.target.value)}
              placeholder="Production repo"
              value={enrollLabel}
            />
          </label>
          <label>
            <span>Mode</span>
            <select onChange={(event) => setEnrollMode(event.target.value as PolicyMode)} value={enrollMode}>
              {MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {enrollError ? (
            <p className="form-error" role="alert">
              {enrollError}
            </p>
          ) : null}
          <div className="setup-form__row">
            <Button disabled={enrollSubmitting} type="submit" variant="primary">
              {enrollSubmitting ? "Saving…" : "Add protected repo"}
            </Button>
            <Button disabled={enrollSubmitting} onClick={closeEnrollForm} type="button" variant="secondary">
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <div className="ops-events">
        <div className="ops-events__table-wrap">
          <table className="ops-events__table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Event</th>
                <th scope="col">Tool</th>
                <th scope="col">Mode</th>
                <th scope="col">Repo</th>
                <th scope="col">Branch</th>
                <th scope="col">Reason</th>
                <th scope="col">Device</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && !events.length ? (
                <tr>
                  <td colSpan={9} className="ops-events__empty">
                    Loading activity…
                  </td>
                </tr>
              ) : null}
              {!loading && !events.length && hasFilters ? (
                <tr>
                  <td colSpan={9} className="ops-events__empty">
                    No events match these filters.
                  </td>
                </tr>
              ) : null}
              {events.map((event) => (
                <tr key={event.id} className="ops-events__row">
                  <td className="ops-events__time">
                    <time dateTime={event.createdAt}>{formatOpsTime(event.createdAt)}</time>
                  </td>
                  <td>{eventTypeLabel(event.eventType)}</td>
                  <td className="ops-events__mono">{event.tool ?? "—"}</td>
                  <td>{modeLabel(event.mode)}</td>
                  <td className="ops-events__mono">
                    {formatActivityRepo(event)}
                    {event.repo && protectedRepoStatusByHash.get(event.repo) === "enforced" ? (
                      <>
                        {" "}
                        <span className="ops-status ops-status--allowed">Protected</span>
                      </>
                    ) : null}
                  </td>
                  <td className="ops-events__mono">{event.branch ?? "—"}</td>
                  <td className="ops-events__message">
                    {event.reason}
                    {typeof event.requestedDurationMinutes === "number"
                      ? ` · Duration ${event.requestedDurationMinutes}m`
                      : ""}
                  </td>
                  <td className="ops-events__mono">{event.deviceId ?? "—"}</td>
                  <td>
                    {event.approvalRequestId ? (
                      <>
                        <Link href={`/dashboard/approvals?highlight=${event.approvalRequestId}`}>
                          View approval
                        </Link>
                        {event.repo ? <> · </> : null}
                      </>
                    ) : null}
                    <ProtectRepoActions
                      canEdit={canEdit}
                      onProtect={openEnrollForm}
                      protectedRepoStatusByHash={protectedRepoStatusByHash}
                      repoHash={event.repo}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ops-events__list">
          {loading && !events.length ? <p className="ops-events__empty">Loading activity…</p> : null}
          {!loading && !events.length && hasFilters ? (
            <p className="ops-events__empty">No events match these filters.</p>
          ) : null}
          {events.map((event) => (
            <ActivityEventCard
              key={event.id}
              canEdit={canEdit}
              event={event}
              onProtect={openEnrollForm}
              protectedRepoStatusByHash={protectedRepoStatusByHash}
            />
          ))}
        </div>
      </div>

      {!events.length && !loading && !hasFilters ? (
        <EmptyState className="dashboard-empty managed-activity-empty">
          <p className="managed-activity-empty__title">No managed profile activity yet</p>
          <p className="managed-activity-empty__detail">
            Run <code>behalf profile status --tool claude</code> from a repo with managed profile shims
            installed.
          </p>
        </EmptyState>
      ) : null}

      {nextCursor ? (
        <p className="ops-console__footnote">
          <button
            type="button"
            className="ops-btn ops-btn--ghost"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </p>
      ) : null}

      <p className="ops-console__footnote">
        <Link href="/dashboard/managed-profiles">Edit managed profile policy</Link>
      </p>
    </div>
  );
}
