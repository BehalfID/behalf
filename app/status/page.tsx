import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { connectToDatabase } from "@/lib/db";
import StatusComponent from "@/models/StatusComponent";
import StatusIncident from "@/models/StatusIncident";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "System Status — BehalfID",
  description: "Real-time status of BehalfID services, components, and recent incidents.",
  alternates: { canonical: "/status" }
};

// Revalidate every 60 seconds for near-real-time status
export const revalidate = 60;

type ComponentStatus = "operational" | "performance_issues" | "partial_outage" | "major_outage";
type IncidentStatus = "investigating" | "identified" | "watching" | "fixed";
type IncidentSeverity = "minor" | "major" | "critical";

const COMPONENT_STATUS_LABELS: Record<ComponentStatus, string> = {
  operational: "Operational",
  performance_issues: "Performance Issues",
  partial_outage: "Partial Outage",
  major_outage: "Major Outage"
};

const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  investigating: "Investigating",
  identified: "Identified",
  watching: "Monitoring",
  fixed: "Resolved"
};

const SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  minor: "Minor",
  major: "Major",
  critical: "Critical"
};

function componentStatusClass(status: ComponentStatus): string {
  switch (status) {
    case "operational": return "status-dot status-dot--operational";
    case "performance_issues": return "status-dot status-dot--performance";
    case "partial_outage": return "status-dot status-dot--partial";
    case "major_outage": return "status-dot status-dot--major";
  }
}

function overallBannerClass(overall: ComponentStatus): string {
  switch (overall) {
    case "operational": return "status-banner status-banner--operational";
    case "performance_issues": return "status-banner status-banner--performance";
    case "partial_outage": return "status-banner status-banner--partial";
    case "major_outage": return "status-banner status-banner--major";
  }
}

function overallMessage(overall: ComponentStatus): string {
  switch (overall) {
    case "operational": return "All systems operational";
    case "performance_issues": return "Some systems experiencing degraded performance";
    case "partial_outage": return "Partial service disruption in progress";
    case "major_outage": return "Major service disruption — our team is working on it";
  }
}

function incidentStatusClass(status: IncidentStatus): string {
  switch (status) {
    case "investigating": return "incident-badge incident-badge--investigating";
    case "identified": return "incident-badge incident-badge--identified";
    case "watching": return "incident-badge incident-badge--watching";
    case "fixed": return "incident-badge incident-badge--fixed";
  }
}

function severityClass(severity: IncidentSeverity): string {
  switch (severity) {
    case "minor": return "incident-badge incident-badge--minor";
    case "major": return "incident-badge incident-badge--major-sev";
    case "critical": return "incident-badge incident-badge--critical";
  }
}

function formatDateTime(value: Date | string | undefined | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(value));
}

function formatDateShort(value: Date | string | undefined | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

async function getStatusData() {
  try {
    await connectToDatabase();

    const [components, incidents] = await Promise.all([
      StatusComponent.find({ enabled: true })
        .sort({ sortOrder: 1, name: 1 })
        .select("-_id componentId name description group status")
        .lean(),
      StatusIncident.find({})
        .sort({ createdAt: -1 })
        .limit(20)
        .select("-_id incidentId title message status severity updates resolvedAt createdAt")
        .lean()
    ]);

    const allStatuses = components.map((c) => c.status as ComponentStatus);
    let overall: ComponentStatus = "operational";
    if (allStatuses.includes("major_outage")) overall = "major_outage";
    else if (allStatuses.includes("partial_outage")) overall = "partial_outage";
    else if (allStatuses.includes("performance_issues")) overall = "performance_issues";

    // Group components
    const groupMap = new Map<string, typeof components>();
    for (const c of components) {
      const key = c.group ?? "";
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(c);
    }
    const groups = Array.from(groupMap.entries()).map(([group, items]) => ({ group, items }));

    const activeIncidents = incidents.filter((i) => i.status !== "fixed");
    const resolvedIncidents = incidents.filter((i) => i.status === "fixed");

    return { overall, groups, activeIncidents, resolvedIncidents };
  } catch {
    // Graceful fallback: if DB is unavailable, show an empty operational state
    return {
      overall: "operational" as ComponentStatus,
      groups: [],
      activeIncidents: [],
      resolvedIncidents: []
    };
  }
}

export default async function StatusPage() {
  const { overall, groups, activeIncidents, resolvedIncidents } = await getStatusData();

  return (
    <main id="main-content" className="marketing" tabIndex={-1}>
      <PublicNav />

      <div className="status-page">
        <h1 className="sr-only">System Status</h1>

        {/* Overall status banner */}
        <div className={overallBannerClass(overall)}>
          <span className="status-banner__icon" aria-hidden="true">
            {overall === "operational" ? "✓" : "!"}
          </span>
          <span className="status-banner__text">{overallMessage(overall)}</span>
        </div>

        {/* Active incidents */}
        {activeIncidents.length > 0 && (
          <section className="status-section" aria-labelledby="active-incidents-heading">
            <h2 id="active-incidents-heading" className="status-section__title">Active Incidents</h2>
            <div className="status-incidents">
              {activeIncidents.map((incident) => (
                <article key={String(incident.incidentId)} className="status-incident status-incident--active">
                  <header className="status-incident__header">
                    <h3 className="status-incident__title">{incident.title}</h3>
                    <div className="status-incident__badges">
                      <span className={incidentStatusClass(incident.status as IncidentStatus)}>
                        {INCIDENT_STATUS_LABELS[incident.status as IncidentStatus]}
                      </span>
                      <span className={severityClass(incident.severity as IncidentSeverity)}>
                        {SEVERITY_LABELS[incident.severity as IncidentSeverity]}
                      </span>
                    </div>
                  </header>
                  {incident.message && (
                    <p className="status-incident__message">{incident.message}</p>
                  )}
                  {incident.updates.length > 0 && (
                    <ol className="status-timeline" reversed>
                      {[...incident.updates].reverse().map((update, i) => (
                        <li key={i} className="status-timeline__entry">
                          <span className="status-timeline__status">
                            {INCIDENT_STATUS_LABELS[update.status as IncidentStatus]}
                          </span>
                          <p className="status-timeline__body">{update.body}</p>
                          <time className="status-timeline__time" dateTime={String(update.createdAt)}>
                            {formatDateTime(update.createdAt)}
                          </time>
                        </li>
                      ))}
                    </ol>
                  )}
                  <footer className="status-incident__footer">
                    <time dateTime={String(incident.createdAt)}>
                      Opened {formatDateTime(incident.createdAt)}
                    </time>
                  </footer>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Component groups */}
        {groups.length > 0 ? (
          <section className="status-section" aria-labelledby="components-heading">
            <h2 id="components-heading" className="status-section__title">Services</h2>
            {groups.map(({ group, items }) => (
              <div key={group || "__ungrouped"} className="status-group">
                {group && <h3 className="status-group__name">{group}</h3>}
                <ul className="status-component-list" aria-label={group || "Services"}>
                  {items.map((component) => (
                    <li key={String(component.componentId)} className="status-component">
                      <div className="status-component__info">
                        <span className="status-component__name">{component.name}</span>
                        {component.description && (
                          <span className="status-component__desc">{component.description}</span>
                        )}
                      </div>
                      <div className="status-component__status">
                        <span
                          className={componentStatusClass(component.status as ComponentStatus)}
                          role="img"
                          aria-label={COMPONENT_STATUS_LABELS[component.status as ComponentStatus]}
                        />
                        <span className="status-component__label">
                          {COMPONENT_STATUS_LABELS[component.status as ComponentStatus]}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ) : (
          <section className="status-section">
            <h2 className="status-section__title">Services</h2>
            <p className="status-empty">No service components configured yet.</p>
          </section>
        )}

        {/* Past incidents */}
        {resolvedIncidents.length > 0 && (
          <section className="status-section" aria-labelledby="past-incidents-heading">
            <h2 id="past-incidents-heading" className="status-section__title">Past Incidents</h2>
            <div className="status-incidents status-incidents--resolved">
              {resolvedIncidents.map((incident) => (
                <article key={String(incident.incidentId)} className="status-incident">
                  <header className="status-incident__header">
                    <h3 className="status-incident__title">{incident.title}</h3>
                    <div className="status-incident__badges">
                      <span className={incidentStatusClass(incident.status as IncidentStatus)}>
                        {INCIDENT_STATUS_LABELS[incident.status as IncidentStatus]}
                      </span>
                      <span className={severityClass(incident.severity as IncidentSeverity)}>
                        {SEVERITY_LABELS[incident.severity as IncidentSeverity]}
                      </span>
                    </div>
                  </header>
                  {incident.updates.length > 0 && (
                    <ol className="status-timeline status-timeline--collapsed" reversed>
                      {[...incident.updates].reverse().map((update, i) => (
                        <li key={i} className="status-timeline__entry">
                          <span className="status-timeline__status">
                            {INCIDENT_STATUS_LABELS[update.status as IncidentStatus]}
                          </span>
                          <p className="status-timeline__body">{update.body}</p>
                          <time className="status-timeline__time" dateTime={String(update.createdAt)}>
                            {formatDateTime(update.createdAt)}
                          </time>
                        </li>
                      ))}
                    </ol>
                  )}
                  <footer className="status-incident__footer">
                    <time dateTime={String(incident.createdAt)}>
                      {formatDateShort(incident.createdAt)}
                    </time>
                    {incident.resolvedAt && (
                      <span> · Resolved {formatDateTime(incident.resolvedAt)}</span>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeIncidents.length === 0 && resolvedIncidents.length === 0 && (
          <section className="status-section">
            <h2 className="status-section__title">Past Incidents</h2>
            <p className="status-empty">No incidents reported.</p>
          </section>
        )}

        <footer className="status-footer">
          <p>
            Status updated every minute.{" "}
            <a href="mailto:support@behalfid.com">Contact support</a>
          </p>
        </footer>
      </div>

      <PublicFooter />
    </main>
  );
}
