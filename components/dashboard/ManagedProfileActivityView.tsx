"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import {
  activitySummaryFromEvents,
  type ManagedProfileActivityEvent,
} from "@/lib/cliAuditActivityTypes";
import { formatOpsTime } from "./opsLogTypes";

type ActivityResponse = {
  events: ManagedProfileActivityEvent[];
  nextCursor: string | null;
};

const EVENT_TYPE_LABELS: Record<ManagedProfileActivityEvent["eventType"], string> = {
  cli_session_policy: "Session policy",
  cli_pause_grant: "Pause grant",
  cli_pause_deny: "Pause denial",
};

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

function eventTypeLabel(eventType: ManagedProfileActivityEvent["eventType"]) {
  return EVENT_TYPE_LABELS[eventType] ?? eventType;
}

function modeLabel(mode: ManagedProfileActivityEvent["mode"]) {
  if (!mode) return "—";
  return mode[0].toUpperCase() + mode.slice(1);
}

function ActivityEventCard({ event }: { event: ManagedProfileActivityEvent }) {
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
        Repo {event.repo ?? "—"} · Branch {event.branch ?? "—"}
      </p>
      <p className="ops-event-card__reason">{event.reason}</p>
      {event.deviceId ? (
        <p className="ops-event-card__meta">
          Device <code>{event.deviceId}</code>
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

  const basePath = useMemo(() => {
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

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchActivity(basePath);
      setEvents(response.events);
      setNextCursor(response.nextCursor);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed.");
      setEvents([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const separator = basePath.includes("?") ? "&" : "?";
      const response = await fetchActivity(`${basePath}${separator}cursor=${encodeURIComponent(nextCursor)}`);
      setEvents((current) => [...current, ...response.events]);
      setNextCursor(response.nextCursor);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed.");
    } finally {
      setLoadingMore(false);
    }
  }, [basePath, loadingMore, nextCursor]);

  useEffect(() => {
    void reload();
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
              </tr>
            </thead>
            <tbody>
              {loading && !events.length ? (
                <tr>
                  <td colSpan={8} className="ops-events__empty">
                    Loading activity…
                  </td>
                </tr>
              ) : null}
              {!loading && !events.length ? (
                <tr>
                  <td colSpan={8} className="ops-events__empty">
                    {hasFilters ? "No events match these filters." : "No managed profile activity yet."}
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
                  <td className="ops-events__mono">{event.repo ?? "—"}</td>
                  <td className="ops-events__mono">{event.branch ?? "—"}</td>
                  <td className="ops-events__message">{event.reason}</td>
                  <td className="ops-events__mono">{event.deviceId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ops-events__list">
          {loading && !events.length ? <p className="ops-events__empty">Loading activity…</p> : null}
          {!loading && !events.length ? (
            <p className="ops-events__empty">
              {hasFilters ? "No events match these filters." : "No managed profile activity yet."}
            </p>
          ) : null}
          {events.map((event) => (
            <ActivityEventCard key={event.id} event={event} />
          ))}
        </div>
      </div>

      {!events.length && !loading ? (
        <EmptyState className="dashboard-empty">
          No managed profile activity yet. Run{" "}
          <code>behalf profile status --tool claude</code> from a repo with managed profile shims installed.
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
