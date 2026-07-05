export type ManagedProfileActivityEvent = {
  id: string;
  createdAt: string;
  eventType: "cli_session_policy" | "cli_pause_grant" | "cli_pause_deny" | "cli_pause_approval_requested";
  tool: string | null;
  mode: "unmanaged" | "managed" | "required" | null;
  granted: boolean | null;
  reason: string;
  repo: string | null;
  branch: string | null;
  deviceId: string | null;
  profileId: string | null;
  profileName: string | null;
  expiresAt: string | null;
};

export function activitySummaryFromEvents(events: ManagedProfileActivityEvent[]) {
  return {
    requiredDecisions: events.filter(
      (event) => event.eventType === "cli_session_policy" && event.mode === "required"
    ).length,
    managedDecisions: events.filter(
      (event) => event.eventType === "cli_session_policy" && event.mode === "managed"
    ).length,
    pauseGrants: events.filter((event) => event.eventType === "cli_pause_grant").length,
    pauseDenials: events.filter((event) => event.eventType === "cli_pause_deny").length,
    pauseApprovalRequests: events.filter(
      (event) => event.eventType === "cli_pause_approval_requested"
    ).length,
  };
}
