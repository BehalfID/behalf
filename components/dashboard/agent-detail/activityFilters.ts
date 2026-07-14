export type AgentActivityFilters = {
  decision: "" | "allowed" | "denied" | "approval_required";
  action: string;
  resource: string;
  from: string;
  to: string;
};

export const EMPTY_ACTIVITY_FILTERS: AgentActivityFilters = {
  decision: "",
  action: "",
  resource: "",
  from: "",
  to: ""
};

export function buildAgentActivityQuery(
  agentId: string,
  filters: AgentActivityFilters,
  page = 1,
  limit = 20
) {
  const params = new URLSearchParams({
    agentId,
    limit: String(limit),
    page: String(page)
  });
  if (filters.decision) params.set("decision", filters.decision);
  if (filters.action.trim()) params.set("action", filters.action.trim());
  if (filters.resource.trim()) params.set("resource", filters.resource.trim());
  if (filters.from) params.set("from", new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) params.set("to", new Date(`${filters.to}T23:59:59.999`).toISOString());
  return `/api/dashboard/logs?${params.toString()}`;
}
