import type { StatusLabels } from "@/components/status/StatusBoard";

/** Maps next-intl `status` namespace keys onto StatusBoard copy. */
export function buildStatusLabels(t: (key: string) => string): StatusLabels {
  return {
    heading: t("title"),
    stateLabel: {
      operational: t("operational"),
      degraded: t("degradedLabel"),
      partial_outage: t("partialOutageLabel"),
      major_outage: t("majorOutageLabel"),
      unknown: t("unknownLabel")
    },
    headline: {
      operational: t("allOperational"),
      degraded: t("degradedHeadline"),
      partial_outage: t("partialOutage"),
      major_outage: t("majorOutage"),
      unknown: t("unknownHeadline")
    },
    servicesTitle: t("servicesTitle"),
    activeIncidentsTitle: t("activeIncidentsTitle"),
    pastIncidentsTitle: t("pastIncidentsTitle"),
    noIncidents: t("noIncidentsReported"),
    incidentsUnavailable: t("incidentsUnavailable"),
    lastChecked: t("lastChecked"),
    refreshStatus: t("refreshStatus"),
    incidentStatusLabel: {
      investigating: t("incidentStatusInvestigating"),
      identified: t("incidentStatusIdentified"),
      watching: t("incidentStatusWatching"),
      fixed: t("incidentStatusFixed")
    },
    severityLabel: {
      minor: t("severityMinor"),
      major: t("severityMajor"),
      critical: t("severityCritical")
    }
  };
}
