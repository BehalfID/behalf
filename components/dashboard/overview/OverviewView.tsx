import Link from "next/link";
import type { DashboardOverview, OverviewDay } from "@/lib/dashboardOverview";
import "./overview.css";

/**
 * Dashboard Overview, ported from the Lovable reference.
 *
 * Server-rendered: every value comes from `loadDashboardOverview`, which owns
 * the metric definitions. Nothing here reclassifies a decision or derives a
 * number the loader did not produce — the page is presentation only.
 *
 * The reference shows illustrative trend percentages ("+4.1% vs previous
 * period"). Production has no comparable-period aggregate, so the trend line is
 * omitted rather than fabricated.
 */

function MetricCard({
  accent,
  hint,
  label,
  value
}: {
  accent?: "warning" | "danger";
  hint?: string;
  label: string;
  value: number | null;
}) {
  return (
    <section className="ov-metric">
      <h3 className="ov-metric__label">{label}</h3>
      {value === null ? (
        <p className="ov-metric__value ov-metric__value--unknown">
          Not recorded
          <span className="sr-only"> — this metric is not available for this workspace</span>
        </p>
      ) : (
        <p className={`ov-metric__value${accent ? ` ov-metric__value--${accent}` : ""}`}>
          {value.toLocaleString()}
        </p>
      )}
      {hint ? <p className="ov-metric__hint">{hint}</p> : null}
    </section>
  );
}

function VolumeChart({ days, windowDays }: { days: OverviewDay[]; windowDays: number }) {
  const peak = Math.max(1, ...days.map((day) => day.allowed + day.denied + day.approvalRequired));
  const total = days.reduce(
    (sum, day) => sum + day.allowed + day.denied + day.approvalRequired,
    0
  );

  if (total === 0) {
    return (
      <p className="ov-empty">
        No decisions recorded in the last {windowDays} days. Bars appear here once an agent calls{" "}
        <code>verify</code>.
      </p>
    );
  }

  const format = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString("en", {
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    });

  return (
    <>
      {/* The bars are decorative; this is the accessible equivalent. */}
      <p className="sr-only">
        {days
          .map(
            (day) =>
              `${format(day.day)}: ${day.allowed} allowed, ${day.denied} denied, ${day.approvalRequired} approval required.`
          )
          .join(" ")}
      </p>
      <div aria-hidden="true" className="ov-chart">
        {days.map((day) => {
          const dayTotal = day.allowed + day.denied + day.approvalRequired;
          return (
            <div className="ov-chart__col" key={day.day} title={`${format(day.day)} · ${dayTotal}`}>
              <div className="ov-chart__stack" style={{ height: `${(dayTotal / peak) * 100}%` }}>
                {day.approvalRequired > 0 ? (
                  <span
                    className="ov-chart__seg ov-chart__seg--approval"
                    style={{ flexGrow: day.approvalRequired }}
                  />
                ) : null}
                {day.denied > 0 ? (
                  <span
                    className="ov-chart__seg ov-chart__seg--denied"
                    style={{ flexGrow: day.denied }}
                  />
                ) : null}
                {day.allowed > 0 ? (
                  <span
                    className="ov-chart__seg ov-chart__seg--allowed"
                    style={{ flexGrow: day.allowed }}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="ov-chart__legend" aria-hidden="true">
        <span className="ov-key ov-key--allowed">Allowed</span>
        <span className="ov-key ov-key--denied">Denied</span>
        <span className="ov-key ov-key--approval">Approval required</span>
        {days.length ? (
          <span className="ov-chart__range">
            {format(days[0]!.day)} – {format(days[days.length - 1]!.day)}
          </span>
        ) : null}
      </div>
    </>
  );
}

function OutcomeSplit({ outcome, windowDays }: { outcome: DashboardOverview["outcome"]; windowDays: number }) {
  if (outcome.total === 0) {
    return <p className="ov-empty">No decisions yet, so there is no outcome split to show.</p>;
  }

  // Exhaustive by construction in the loader, so these reconcile to 100%.
  const rows = [
    { key: "allowed", label: "Allowed", value: outcome.allowed },
    { key: "denied", label: "Denied", value: outcome.denied },
    { key: "approval", label: "Approval required", value: outcome.approvalRequired }
  ] as const;

  const pct = (value: number) => (value / outcome.total) * 100;

  return (
    <>
      <div className="ov-split__bar" aria-hidden="true">
        {rows.map((row) =>
          row.value > 0 ? (
            <span
              className={`ov-split__seg ov-split__seg--${row.key}`}
              key={row.key}
              style={{ width: `${pct(row.value)}%` }}
            />
          ) : null
        )}
      </div>
      <dl className="ov-split__list">
        {rows.map((row) => (
          <div className="ov-split__row" key={row.key}>
            <dt>
              <span aria-hidden="true" className={`ov-dot ov-dot--${row.key}`} />
              {row.label}
            </dt>
            <dd>
              <span className="ov-split__count">{row.value.toLocaleString()}</span>
              <span className="ov-split__pct">{pct(row.value).toFixed(1)}%</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="ov-note">Last {windowDays} days · enforced decisions only</p>
    </>
  );
}

function relativeTime(iso: string) {
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const OUTCOME_LABEL = {
  allowed: "Allowed",
  denied: "Denied",
  approval_required: "Approval required"
} as const;

export function OverviewView({
  data,
  href
}: {
  data: DashboardOverview;
  /** Builds a workspace-scoped dashboard href. */
  href: (subpath: string) => string;
}) {
  return (
    <div className="ds ov">
      <header className="ov-header">
        <div className="ov-header__text">
          <p className="ov-eyebrow">Workspace</p>
          <h1 className="ov-title">Overview</h1>
          <p className="ov-lede">
            What your agents did, and what is waiting on a person right now.
          </p>
        </div>
        <div className="ov-header__actions">
          {data.canReview && (data.pendingApprovals.value ?? 0) > 0 ? (
            <Link className="ov-button" href={href("/approvals")}>
              Review approvals
            </Link>
          ) : null}
          {data.canMutate ? (
            <Link className="ov-button ov-button--primary" href={href("/onboarding")}>
              {data.isEmpty ? "Set up first agent" : "Add agent"}
            </Link>
          ) : null}
        </div>
      </header>

      <div className="ov-metrics">
        <MetricCard
          accent={(data.pendingApprovals.value ?? 0) > 0 ? "warning" : undefined}
          label="Pending approvals"
          value={data.pendingApprovals.value}
        />
        <MetricCard label="Actions verified today" value={data.verifiedToday.value} />
        <MetricCard label="Active agents" value={data.activeAgents.value} />
        <MetricCard
          accent={(data.deniedOrBlocked.value ?? 0) > 0 ? "danger" : undefined}
          hint={`Last ${data.windowDays} days`}
          label="Denied or blocked"
          value={data.deniedOrBlocked.value}
        />
      </div>

      <div className="ov-grid ov-grid--charts">
        <section className="ov-card ov-card--chart" aria-labelledby="ov-volume">
          <div className="ov-card__head">
            <div>
              <h2 className="ov-card__title" id="ov-volume">Verification volume</h2>
              <p className="ov-card__sub">Decisions recorded per day across every agent.</p>
            </div>
          </div>
          <VolumeChart days={data.daily} windowDays={data.windowDays} />
        </section>

        <section className="ov-card" aria-labelledby="ov-split">
          <div className="ov-card__head">
            <div>
              <h2 className="ov-card__title" id="ov-split">Outcome split</h2>
              <p className="ov-card__sub">Last {data.windowDays} days</p>
            </div>
          </div>
          <OutcomeSplit outcome={data.outcome} windowDays={data.windowDays} />
        </section>
      </div>

      <div className="ov-grid ov-grid--lists">
        <section className="ov-card" aria-labelledby="ov-waiting">
          <div className="ov-card__head">
            <div>
              <h2 className="ov-card__title" id="ov-waiting">Waiting for a person</h2>
              <p className="ov-card__sub">Nothing below has executed.</p>
            </div>
            <Link className="ov-link" href={href("/inbox")}>Open inbox</Link>
          </div>

          {data.approvals.length === 0 ? (
            <p className="ov-empty">
              Nothing is awaiting review. Gated actions pause here before they run.
            </p>
          ) : (
            <ul className="ov-list">
              {data.approvals.map((approval) => (
                <li className="ov-list__row" key={approval.approvalId}>
                  <div className="ov-list__main">
                    <p className="ov-list__title">{approval.action}</p>
                    <p className="ov-list__meta">
                      {[approval.agentName, approval.vendor, approval.environment]
                        .filter(Boolean)
                        .join(" · ") || "Awaiting review"}
                    </p>
                    {approval.risk ? (
                      <span className={`ov-risk ov-risk--${approval.risk}`}>
                        {approval.risk} risk
                      </span>
                    ) : null}
                  </div>
                  {data.canReview ? (
                    <Link className="ov-button ov-button--small" href={href("/approvals")}>
                      Review
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ov-card" aria-labelledby="ov-recent">
          <div className="ov-card__head">
            <div>
              <h2 className="ov-card__title" id="ov-recent">Recent decisions</h2>
            </div>
            <Link className="ov-link" href={href("/logs")}>All activity</Link>
          </div>

          {data.decisions.length === 0 ? (
            <p className="ov-empty">
              Decisions appear here the moment an agent calls <code>verify</code>.
            </p>
          ) : (
            <ul className="ov-list">
              {data.decisions.map((decision) => (
                <li className="ov-list__row ov-list__row--compact" key={decision.logId}>
                  {/* Outcome is never communicated by colour alone. */}
                  <span className={`ov-outcome ov-outcome--${decision.outcome}`}>
                    {OUTCOME_LABEL[decision.outcome]}
                  </span>
                  <span className="ov-list__action">{decision.action}</span>
                  <span className="ov-list__agent">{decision.agentName ?? "—"}</span>
                  <time className="ov-list__time" dateTime={decision.createdAt}>
                    {relativeTime(decision.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
