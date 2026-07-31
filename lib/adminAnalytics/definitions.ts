/**
 * Canonical admin analytics metric definitions.
 *
 * These strings ship inside every analytics response and are the single source
 * of truth for `docs/ANALYTICS.md`. If a number's meaning changes, change it
 * here so the API, the UI tooltips, and the docs cannot drift apart.
 */

export const ADMIN_ANALYTICS_DEFINITIONS: Record<string, string> = {
  "range.boundaries":
    "All windows are half-open in UTC: start <= createdAt < end. Preset windows end at the boundary after the current bucket, so the newest bucket is still filling.",
  "range.timezone":
    "Bucketing and boundaries are always computed in UTC, independent of the server or viewer timezone.",

  "summary.users.total": "DeveloperUser records that exist right now, all workspaces, all time.",
  "summary.users.new": "DeveloperUser records whose createdAt falls inside the selected window.",
  "summary.workspaces.total": "Account records that exist right now. One Account is one workspace.",
  "summary.workspaces.new": "Account records whose createdAt falls inside the selected window.",
  "summary.agents.total": "Agent records that exist right now, any status.",
  "summary.agents.new": "Agent records whose createdAt falls inside the selected window.",
  "summary.agents.activeConfigured":
    "Agent records with status=\"active\". This is a configuration state, not usage — an active agent that never calls verify still counts here.",
  "summary.agents.activeInPeriod":
    "Distinct agentId values with at least one verification attempt inside the window. This is the usage-based definition of \"active\" and includes shadow-mode traffic.",

  "summary.verifications.attempts":
    "Every persisted VerificationLog record in the window, one per verify() call. Enforced + shadow.",
  "summary.verifications.enforced":
    "Attempts that were not shadow-mode, i.e. the decision actually gated the agent. Denominator for every outcome rate.",
  "summary.verifications.allowed": "Enforced attempts with allowed=true.",
  "summary.verifications.denied":
    "Enforced attempts with allowed=false that were NOT approval gates — a hard policy denial.",
  "summary.verifications.approvalRequired":
    "Enforced attempts with allowed=false that were paused for human approval (approvalRequired=true, or a reason matching the approval-gate phrases). Counted separately from denied so a pause is never reported as a block.",
  "summary.verifications.indeterminate":
    "Enforced attempts whose allowed field is missing or not a boolean, so no outcome can be derived. Normally zero; a non-zero value is a data-integrity signal, not agent behaviour.",
  "summary.verifications.shadow":
    "Attempts recorded in shadow mode. Reported separately and excluded from every enforced total and rate, because shadow decisions have no side effects.",
  "summary.verifications.highRisk": "Enforced attempts with risk=\"high\".",
  "summary.verifications.uniqueAgents": "Distinct agentId values across all attempts in the window.",
  "summary.verifications.uniqueWorkspaces":
    "Distinct non-null accountId values across all attempts in the window.",
  "summary.verifications.outcomeExhaustiveness":
    "allowed + denied + approvalRequired + indeterminate always equals enforced. The four outcomes are mutually exclusive, so an approval pause is never double-counted as a denial.",

  "summary.verifications.rates":
    "Every rate is a fraction of enforced attempts and ships its own numerator and denominator. When the denominator is zero the value is null, never 0 — an undefined rate is not the same as a zero rate.",

  "summary.approvals.createdInPeriod":
    "ApprovalRequest records created in the window. One record per distinct request tuple: an agent that polls verify() repeatedly while pending produces many approvalRequired attempts but only one approval request, so these two numbers are expected to differ.",
  "summary.approvals.approvedInPeriod":
    "ApprovalRequest records resolved to approved or used with resolvedAt in the window.",
  "summary.approvals.deniedInPeriod": "ApprovalRequest records denied with resolvedAt in the window.",
  "summary.approvals.usedInPeriod":
    "Approved grants consumed by a later verify() call with usedAt in the window. The retry itself is a separate attempt and appears under allowed.",
  "summary.approvals.pendingNow":
    "ApprovalRequest records currently pending. This is a live backlog and is deliberately NOT window-scoped.",

  "timeseries.verifications":
    "One point per bucket with the same outcome taxonomy as the summary. Summing any field across the series equals the matching summary field whenever the series is not truncated.",
  "timeseries.activeAgents":
    "Distinct agentId values with at least one attempt inside each individual bucket. Bucket values do not sum to the period total, because an agent active on several days is counted once per day.",
  "timeseries.signups": "DeveloperUser records created per bucket.",
  "timeseries.workspacesCreated": "Account records created per bucket.",
  "timeseries.agentsCreated": "Agent records created per bucket.",
  "timeseries.zeroFill":
    "Buckets with no rows are returned as explicit zeros so gaps cannot be silently compressed.",

  "breakdowns.topWorkspaces":
    "The highest-volume workspaces by enforced + shadow attempts in the window, ranked server-side and capped. Attempts with no accountId are grouped under a null id.",
  "breakdowns.topAgents": "The highest-volume agents by attempts in the window, ranked server-side and capped.",
  "breakdowns.providerAdoption":
    "Sign-in method adoption counted from persisted DeveloperUser identity fields (authProviders, with passwordHash/googleSub used to classify legacy rows that predate authProviders). Users with several methods are counted under each. Rows with no derivable method are reported as unknown_legacy rather than dropped.",

  "freshness.latestVerificationAt":
    "createdAt of the newest verification record in scope, ignoring the selected window. Used to show how fresh the underlying data is.",
  partial:
    "True when the payload is knowingly incomplete: the newest bucket is still filling, the series was clamped to the bucket cap, or an aggregation degraded. Reasons are enumerated in partialReasons."
};

/** Human-readable label for the usage-based "active" definition, reused in UI copy. */
export const ACTIVE_AGENT_DEFINITION =
  "An agent is active when it recorded at least one verification attempt in the selected window (shadow mode included).";
