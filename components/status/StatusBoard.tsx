/**
 * Presentational status board.
 *
 * Deliberately dependency-free: no client hooks, no next-intl, no function
 * props, no data fetching. A status page has to render when the rest of the app
 * is degraded, so everything it needs arrives as serializable props and all
 * copy is injected by the caller.
 */

import type { HealthState, PublicIncident, SystemStatus } from "@/lib/statusHealth";

export type StatusLabels = {
  heading: string;
  stateLabel: Record<HealthState, string>;
  headline: Record<HealthState, string>;
  servicesTitle: string;
  activeIncidentsTitle: string;
  pastIncidentsTitle: string;
  noIncidents: string;
  incidentsUnavailable: string;
  lastChecked: string;
  refreshStatus: string;
  incidentStatusLabel: Record<string, string>;
  severityLabel: Record<string, string>;
};

export const DEFAULT_STATUS_LABELS: StatusLabels = {
  heading: "System status",
  stateLabel: {
    operational: "Operational",
    degraded: "Degraded",
    partial_outage: "Partial outage",
    major_outage: "Major outage",
    unknown: "Unknown"
  },
  headline: {
    operational: "All systems operational",
    degraded: "Some systems are degraded",
    partial_outage: "Partial service outage",
    major_outage: "Major service outage",
    unknown: "Current status unavailable"
  },
  servicesTitle: "Services",
  activeIncidentsTitle: "Active incidents",
  pastIncidentsTitle: "Past incidents",
  noIncidents: "No incidents reported.",
  incidentsUnavailable: "Incident history is temporarily unavailable.",
  lastChecked: "Last checked",
  refreshStatus: "Refresh status",
  incidentStatusLabel: {
    investigating: "Investigating",
    identified: "Identified",
    watching: "Monitoring",
    fixed: "Resolved"
  },
  severityLabel: {
    minor: "Minor",
    major: "Major",
    critical: "Critical"
  }
};

/** Reuses the existing status palette; "unknown" is the one new variant. */
const STATE_MODIFIER: Record<HealthState, string> = {
  operational: "operational",
  degraded: "performance",
  partial_outage: "partial",
  major_outage: "major",
  unknown: "unknown"
};

function bannerClass(state: HealthState) {
  return `status-banner status-banner--${STATE_MODIFIER[state]}`;
}

function dotClass(state: HealthState) {
  return `status-dot status-dot--${STATE_MODIFIER[state]}`;
}

function incidentStatusClass(status: string) {
  const known = ["investigating", "identified", "watching", "fixed"];
  return `incident-badge incident-badge--${known.includes(status) ? status : "investigating"}`;
}

function severityClass(severity: string) {
  switch (severity) {
    case "critical":
      return "incident-badge incident-badge--critical";
    case "major":
      return "incident-badge incident-badge--major-sev";
    default:
      return "incident-badge incident-badge--minor";
  }
}

function BannerIcon({ state }: { state: HealthState }) {
  if (state === "operational") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path
          d="M2.5 7l3 3 6-6"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (state === "unknown") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path
          d="M5 5a2 2 0 1 1 2.7 1.87c-.42.16-.7.56-.7 1.01v.37M7 10.5v.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Renders a UTC timestamp. UTC is intentional: it keeps server output stable so
 * the markup does not depend on the deployment's local timezone.
 */
function Timestamp({ value }: { value: string }) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const formatted = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short"
  }).format(parsed);

  return <time dateTime={parsed.toISOString()}>{formatted}</time>;
}

function IncidentCard({
  incident,
  labels,
  active
}: {
  incident: PublicIncident;
  labels: StatusLabels;
  active: boolean;
}) {
  return (
    <article
      className={`status-incident${active ? " status-incident--active" : ""}`}
      aria-labelledby={`incident-${incident.id}`}
    >
      <header className="status-incident__header">
        <h3 className="status-incident__title" id={`incident-${incident.id}`}>
          {incident.title}
        </h3>
        <div className="status-incident__badges">
          <span className={incidentStatusClass(incident.status)}>
            {labels.incidentStatusLabel[incident.status] ?? incident.status}
          </span>
          <span className={severityClass(incident.severity)}>
            {labels.severityLabel[incident.severity] ?? incident.severity}
          </span>
        </div>
      </header>

      {incident.message ? <p className="status-incident__message">{incident.message}</p> : null}

      {incident.updates.length > 0 ? (
        <ol className={`status-timeline${active ? "" : " status-timeline--collapsed"}`} reversed>
          {[...incident.updates].reverse().map((update, index) => (
            <li key={`${incident.id}-${index}`} className="status-timeline__entry">
              <span className="status-timeline__status">
                {labels.incidentStatusLabel[update.status] ?? update.status}
              </span>
              <p className="status-timeline__body">{update.body}</p>
              <span className="status-timeline__time">
                <Timestamp value={update.createdAt} />
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <footer className="status-incident__footer">
        <Timestamp value={incident.createdAt} />
        {incident.resolvedAt ? (
          <span>
            {" · "}
            {labels.incidentStatusLabel.fixed ?? "Resolved"} <Timestamp value={incident.resolvedAt} />
          </span>
        ) : null}
      </footer>
    </article>
  );
}

export function StatusBoard({
  status,
  labels = DEFAULT_STATUS_LABELS,
  refreshHref = "/status"
}: {
  status: SystemStatus;
  labels?: StatusLabels;
  /** Same-tab refresh target; defaults to the public status page. */
  refreshHref?: string;
}) {
  const { overall, groups, activeIncidents, resolvedIncidents, incidentsUnavailable } = status;

  return (
    <div className="status-page">
      <h1 className="sr-only">{labels.heading}</h1>

      <div className={bannerClass(overall)} role="status">
        <span className="status-banner__icon" aria-hidden="true">
          <BannerIcon state={overall} />
        </span>
        <span className="status-banner__text">{labels.headline[overall]}</span>
      </div>

      {activeIncidents.length > 0 ? (
        <section className="status-section" aria-labelledby="active-incidents-heading">
          <h2 id="active-incidents-heading" className="status-section__title">
            {labels.activeIncidentsTitle}
          </h2>
          <div className="status-incidents">
            {activeIncidents.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} labels={labels} active />
            ))}
          </div>
        </section>
      ) : null}

      <section className="status-section" aria-labelledby="components-heading">
        <h2 id="components-heading" className="status-section__title">
          {labels.servicesTitle}
        </h2>
        {groups.map(({ group, services }) => (
          <div key={group} className="status-group">
            <h3 className="status-group__name">{group}</h3>
            <ul className="status-component-list" aria-label={group}>
              {services.map((service) => (
                <li key={service.id} className="status-component">
                  <div className="status-component__info">
                    <span className="status-component__name">{service.name}</span>
                    <span className="status-component__desc">{service.description}</span>
                  </div>
                  <div className="status-component__status">
                    <span className={dotClass(service.state)} aria-hidden="true" />
                    <span className="status-component__label">
                      {labels.stateLabel[service.state]}
                    </span>
                    <span className="sr-only">{service.detail}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="status-section" aria-labelledby="past-incidents-heading">
        <h2 id="past-incidents-heading" className="status-section__title">
          {labels.pastIncidentsTitle}
        </h2>
        {incidentsUnavailable ? (
          <p className="status-empty">{labels.incidentsUnavailable}</p>
        ) : resolvedIncidents.length > 0 ? (
          <div className="status-incidents status-incidents--resolved">
            {resolvedIncidents.map((incident) => (
              <IncidentCard
                key={incident.id}
                incident={incident}
                labels={labels}
                active={false}
              />
            ))}
          </div>
        ) : (
          <p className="status-empty">{labels.noIncidents}</p>
        )}
      </section>

      <footer className="status-footer">
        <p>
          {labels.lastChecked} <Timestamp value={status.checkedAt} />
          {" · "}
          <a href={refreshHref}>{labels.refreshStatus}</a>
          {" · "}
          <a href="mailto:support@behalfid.com">Contact support</a>
          {" · "}
          <a href="/docs">Documentation</a>
        </p>
      </footer>
    </div>
  );
}
