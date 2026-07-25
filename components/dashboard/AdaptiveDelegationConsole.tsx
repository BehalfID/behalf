"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Alert, Badge, Button, DashboardState, PageHeader, PageLoadingState, RefreshingIndicator } from "@/components/ui";
import { useDashboardApi } from "@/components/workspace/WorkspaceProvider";
import { workspaceDashboardHref } from "@/lib/workspaceSlug";
import type {
  AdaptiveDelegationRecommendationView,
  AdaptiveDelegationStats
} from "@/lib/adaptiveDelegation/types";

type DashboardResponse = {
  recommendations: AdaptiveDelegationRecommendationView[];
  applied: AdaptiveDelegationRecommendationView[];
  dismissed: AdaptiveDelegationRecommendationView[];
  postponed: AdaptiveDelegationRecommendationView[];
  stats: AdaptiveDelegationStats;
  refreshed?: { created: number; updated: number };
};

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const variant = confidence >= 90 ? "success" : confidence >= 70 ? "warning" : "neutral";
  return <Badge variant={variant}>{confidence}% confidence</Badge>;
}

function RecommendationCard({
  recommendation,
  workspaceSlug,
  busy,
  onAccept,
  onKeepManual,
  onPostpone,
  onNever
}: {
  recommendation: AdaptiveDelegationRecommendationView;
  workspaceSlug: string | null;
  busy: boolean;
  onAccept: (agentIds?: string[]) => void;
  onKeepManual: () => void;
  onPostpone: () => void;
  onNever: () => void;
}) {
  const agentHref = workspaceDashboardHref(workspaceSlug ?? "legacy", `/agents/${recommendation.agentId}`);
  const isTrustProfile = recommendation.kind === "trust_profile";
  const isContextScoped = recommendation.kind === "context_scoped_permission";
  const isOrgDelegation = recommendation.kind === "organization_delegation";
  const title = isTrustProfile
    ? recommendation.proposedTrustProfile?.name ?? "Trust profile"
    : isOrgDelegation
      ? recommendation.proposedOrgDelegation?.name ?? "Organization template"
      : recommendation.action;
  const kindLabel = isTrustProfile
    ? "Trust profile"
    : isContextScoped
      ? "Context-scoped"
      : isOrgDelegation
        ? "Organization"
        : "Permission";

  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(
    () => recommendation.proposedOrgDelegation?.agentIds ?? []
  );

  return (
    <article className="ops-panel" style={{ marginBottom: "1rem" }}>
      <div className="ops-panel__head">
        <div>
          <Badge
            variant={
              isTrustProfile ? "accent" : isContextScoped ? "warning" : isOrgDelegation ? "accent" : "outline"
            }
          >
            {kindLabel}
          </Badge>{" "}
          <strong>{title}</strong>
          {recommendation.resource ? <span> · {recommendation.resource}</span> : null}
        </div>
        <ConfidenceBadge confidence={recommendation.confidence} />
      </div>

      <p style={{ marginTop: "0.75rem", marginBottom: "0.75rem" }}>{recommendation.explanation}</p>

      {isOrgDelegation && recommendation.proposedOrgDelegation ? (
        <div style={{ marginBottom: "0.75rem" }}>
          <p style={{ marginBottom: "0.35rem" }}>
            {recommendation.proposedOrgDelegation.department} · coverage{" "}
            {recommendation.proposedOrgDelegation.coveragePercent}% · apply to selected agents
          </p>
          <ul className="ops-feed">
            {recommendation.proposedOrgDelegation.agentIds.map((agentId, index) => {
              const label =
                recommendation.proposedOrgDelegation?.agentLabels[index] ?? agentId;
              const checked = selectedAgentIds.includes(agentId);
              return (
                <li key={agentId} className="ops-feed__row">
                  <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={() => {
                        setSelectedAgentIds((current) =>
                          checked
                            ? current.filter((id) => id !== agentId)
                            : [...current, agentId]
                        );
                      }}
                    />
                    <span>{label}</span>
                  </label>
                  <code>{agentId}</code>
                </li>
              );
            })}
          </ul>
          <ul className="ops-feed" style={{ marginTop: "0.5rem" }}>
            {recommendation.proposedOrgDelegation.permissions.map((permission) => (
              <li key={permission.action} className="ops-feed__row">
                <span>
                  <code>{permission.action}</code>
                  {permission.resource ? ` · ${permission.resource}` : ""}
                </span>
                <Badge variant={permission.requiresApproval ? "warning" : "success"}>
                  {permission.requiresApproval ? "Approval required" : "Reusable"}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {isContextScoped && recommendation.evidence.context ? (
        <dl className="ops-strip" style={{ marginBottom: "0.75rem" }}>
          <div className="ops-strip__seg">
            <dt>Dimension</dt>
            <dd>{recommendation.evidence.context.dimension}</dd>
          </div>
          <div className="ops-strip__seg">
            <dt>Safe contexts</dt>
            <dd>{recommendation.evidence.context.safeValues.join(", ") || "—"}</dd>
          </div>
          <div className="ops-strip__seg">
            <dt>Protected</dt>
            <dd>{recommendation.evidence.context.protectedValues.join(", ") || "—"}</dd>
          </div>
        </dl>
      ) : null}

      {isContextScoped && recommendation.proposedPermission?.constraints ? (
        <ul className="ops-feed" style={{ marginBottom: "0.75rem" }}>
          {Object.entries(recommendation.proposedPermission.constraints).map(([key, values]) =>
            Array.isArray(values) && values.length ? (
              <li key={key} className="ops-feed__row">
                <span>
                  <code>{key}</code>
                </span>
                <span>{values.join(", ")}</span>
              </li>
            ) : null
          )}
        </ul>
      ) : null}

      {isTrustProfile && recommendation.proposedTrustProfile ? (
        <div style={{ marginBottom: "0.75rem" }}>
          <p style={{ marginBottom: "0.35rem" }}>
            Coverage {recommendation.proposedTrustProfile.coveragePercent}% · scope{" "}
            {recommendation.proposedTrustProfile.resourceScope}
          </p>
          <ul className="ops-feed">
            {recommendation.proposedTrustProfile.permissions.map((permission) => (
              <li key={permission.action} className="ops-feed__row">
                <span>
                  <code>{permission.action}</code>
                  {permission.resource ? ` · ${permission.resource}` : ""}
                </span>
                <Badge variant={permission.requiresApproval ? "warning" : "success"}>
                  {permission.requiresApproval ? "Approval required" : "Reusable"}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <dl className="ops-strip" style={{ marginBottom: "0.75rem" }}>
        <div className="ops-strip__seg">
          <dt>Approved</dt>
          <dd>{recommendation.evidence.approvedCount}</dd>
        </div>
        <div className="ops-strip__seg">
          <dt>Denied</dt>
          <dd>{recommendation.evidence.deniedCount}</dd>
        </div>
        <div className="ops-strip__seg">
          <dt>Est. fewer prompts</dt>
          <dd>{recommendation.estimatedApprovalReduction}</dd>
        </div>
        <div className="ops-strip__seg">
          <dt>Agent</dt>
          <dd>
            {isOrgDelegation ? (
              <span>{recommendation.proposedOrgDelegation?.agentIds.length ?? 0} agents</span>
            ) : (
              <Link href={agentHref}>{recommendation.agentName ?? recommendation.agentId}</Link>
            )}
          </dd>
        </div>
      </dl>

      <details style={{ marginBottom: "0.75rem" }}>
        <summary>Evidence &amp; security impact</summary>
        <ul style={{ marginTop: "0.5rem" }}>
          {recommendation.factors.map((factor) => (
            <li key={factor.code}>
              {factor.polarity === "positive" ? "+" : ""}
              {factor.delta}: {factor.label}
            </li>
          ))}
        </ul>
        <p style={{ marginTop: "0.5rem" }}>{recommendation.securityImpact.summary}</p>
        <ul>
          {recommendation.securityImpact.riskNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <p>
          <strong>Rollback:</strong> {recommendation.rollbackInstructions}
        </p>
      </details>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <Button
          type="button"
          disabled={busy || (isOrgDelegation && selectedAgentIds.length === 0)}
          onClick={() => onAccept(isOrgDelegation ? selectedAgentIds : undefined)}
        >
          {isTrustProfile
            ? "Apply Trust Profile"
            : isContextScoped
              ? "Create Context Permission"
              : isOrgDelegation
                ? "Apply Organization Template"
                : "Create Permission"}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={onKeepManual}>
          Keep Manual Approval
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={onPostpone}>
          Remind Me Later
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onNever}>
          Never Suggest This Again
        </Button>
      </div>
    </article>
  );
}

function StatStrip({ stats }: { stats: AdaptiveDelegationStats }) {
  return (
    <dl className="ops-strip">
      <div className="ops-strip__seg">
        <dt>Active</dt>
        <dd>{stats.activeRecommendations}</dd>
      </div>
      <div className="ops-strip__seg">
        <dt>Permissions</dt>
        <dd>{stats.activePermissionRecommendations}</dd>
      </div>
      <div className="ops-strip__seg">
        <dt>Trust profiles</dt>
        <dd>{stats.activeTrustProfileRecommendations}</dd>
      </div>
      <div className="ops-strip__seg">
        <dt>Context-scoped</dt>
        <dd>{stats.activeContextRecommendations}</dd>
      </div>
      <div className="ops-strip__seg">
        <dt>Organization</dt>
        <dd>{stats.activeOrgRecommendations}</dd>
      </div>
      <div className="ops-strip__seg">
        <dt>Applied</dt>
        <dd>{stats.acceptedRecommendations}</dd>
      </div>
      <div className="ops-strip__seg">
        <dt>Est. fewer prompts</dt>
        <dd>{stats.estimatedApprovalReduction}</dd>
      </div>
    </dl>
  );
}

function FrequencyList({
  title,
  items
}: {
  title: string;
  items: Array<{ action: string; resource: string | null; count: number }>;
}) {
  return (
    <section className="ops-panel">
      <div className="ops-panel__head">
        <strong>{title}</strong>
      </div>
      {items.length === 0 ? (
        <p className="ops-empty">No data in the lookback window.</p>
      ) : (
        <ul className="ops-feed">
          {items.map((item) => (
            <li key={`${item.action}:${item.resource ?? ""}:${item.count}`} className="ops-feed__row">
              <span>
                <code>{item.action}</code>
                {item.resource ? ` · ${item.resource}` : ""}
              </span>
              <strong>{item.count}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AdaptiveDelegationConsole() {
  const { apiJson, workspaceSlug } = useDashboardApi();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [dataWorkspaceSlug, setDataWorkspaceSlug] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [errorWorkspaceSlug, setErrorWorkspaceSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const requestId = useRef(0);

  const reload = useCallback(
    async (refresh = true) => {
      const id = ++requestId.current;
      setLoading(true);
      setError("");
      setErrorWorkspaceSlug(workspaceSlug);
      try {
        const path = refresh
          ? "/api/dashboard/adaptive-delegation"
          : "/api/dashboard/adaptive-delegation?refresh=false";
        const result = await apiJson<DashboardResponse>(path);
        if (requestId.current !== id) return;
        setData(result);
        setDataWorkspaceSlug(workspaceSlug);
      } catch (requestError) {
        if (requestId.current !== id) return;
        setError(requestError instanceof Error ? requestError.message : "Request failed.");
      } finally {
        if (requestId.current === id) setLoading(false);
      }
    },
    [apiJson, workspaceSlug]
  );

  useEffect(() => {
    // Preserve the established dashboard fetch-on-mount pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload(true);
  }, [reload]);

  const act = async (
    recommendationId: string,
    action: "accept" | "dismiss" | "postpone",
    body?: Record<string, unknown>
  ) => {
    setBusyId(recommendationId);
    setError("");
    setStatusMessage("");
    try {
      await apiJson(`/api/dashboard/adaptive-delegation/${recommendationId}/${action}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      await reload(false);
      if (action === "accept") {
        const accepted = data?.recommendations.find((row) => row.recommendationId === recommendationId);
        setStatusMessage(
          accepted?.kind === "trust_profile"
            ? "Trust profile created and applied. Elevated profile actions still require approval through verify()."
            : accepted?.kind === "context_scoped_permission"
              ? "Context-scoped permission created. Safe contexts skip repeated approval; protected contexts stay gated."
              : accepted?.kind === "organization_delegation"
                ? "Organization template created and applied to selected agents. verify() remains the sole decision point."
                : "Permission created. Future matching verify() calls use the new permission; authority was not expanded automatically."
        );
      } else if (action === "postpone") {
        setStatusMessage("Reminder postponed. This pattern will resurface after the reminder window.");
      } else if (body?.reason === "never_suggest") {
        setStatusMessage("This pattern will not be suggested again.");
      } else {
        setStatusMessage("Kept manual approval. verify() continues to require human decisions for this pattern.");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const visibleData = dataWorkspaceSlug === workspaceSlug ? data : null;
  const visibleError = errorWorkspaceSlug === workspaceSlug ? error : "";
  const initialLoading = loading || (!visibleData && !visibleError);

  if (initialLoading && !visibleData) {
    return <PageLoadingState label="Analyzing approval history" variant="table" />;
  }

  return (
    <div className="ops-console">
      <PageHeader
        eyebrow="Advisory recommendations"
        title="Adaptive Delegation"
        description="Deterministic suggestions from approval history. Advisory only — never auto-grants authority or bypasses verify()."
        action={
          <Button
            type="button"
            variant="outline"
            size="small"
            onClick={() => void reload(true)}
            loading={loading && Boolean(visibleData)}
          >
            Refresh analysis
          </Button>
        }
        className="dashboard-header ops-console__header"
      />

      {statusMessage ? <Alert tone="success" className="ops-feedback">{statusMessage}</Alert> : null}
      {visibleError && visibleData ? (
        <Alert tone="destructive" className="ops-feedback">
          {visibleError}
        </Alert>
      ) : null}
      {loading && visibleData ? <RefreshingIndicator label="Refreshing Adaptive Delegation" /> : null}

      {!visibleData ? (
        <DashboardState
          kind="error"
          title="Adaptive Delegation unavailable"
          description={visibleError || "Recommendations could not be loaded."}
          action={
            <Button type="button" variant="outline" size="small" onClick={() => void reload(true)}>
              Try again
            </Button>
          }
        />
      ) : (
        <>
          <StatStrip stats={visibleData.stats} />

          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Active recommendations</h2>
            {visibleData.recommendations.length === 0 ? (
              <DashboardState
                kind="empty"
                title="No active recommendations"
                description="Keep approving normally. When a pattern is repetitive and low-risk enough, a suggestion will appear here for explicit acceptance."
              />
            ) : (
              visibleData.recommendations.map((recommendation) => (
                <RecommendationCard
                  key={recommendation.recommendationId}
                  recommendation={recommendation}
                  workspaceSlug={workspaceSlug}
                  busy={busyId === recommendation.recommendationId}
                  onAccept={(agentIds) =>
                    void act(
                      recommendation.recommendationId,
                      "accept",
                      agentIds ? { agentIds } : undefined
                    )
                  }
                  onKeepManual={() =>
                    void act(recommendation.recommendationId, "dismiss", { reason: "keep_manual" })
                  }
                  onPostpone={() => void act(recommendation.recommendationId, "postpone")}
                  onNever={() =>
                    void act(recommendation.recommendationId, "dismiss", { reason: "never_suggest" })
                  }
                />
              ))
            )}
          </section>

          <div className="ops-grid" style={{ marginTop: "1.5rem" }}>
            <FrequencyList title="Frequently approved" items={visibleData.stats.frequentlyApproved} />
            <FrequencyList title="Frequently denied" items={visibleData.stats.frequentlyDenied} />
          </div>

          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Applied</h2>
            {visibleData.applied.length === 0 ? (
              <p className="ops-empty">No accepted recommendations yet.</p>
            ) : (
              <ul className="ops-feed">
                {visibleData.applied.map((item) => (
                  <li key={item.recommendationId} className="ops-feed__row">
                    <span>
                      {item.kind === "trust_profile" ? (
                        <>
                          Trust profile · {item.proposedTrustProfile?.name ?? item.action}
                          {item.acceptedProfileId ? ` → ${item.acceptedProfileId}` : ""}
                        </>
                      ) : item.kind === "organization_delegation" ? (
                        <>
                          Org · {item.proposedOrgDelegation?.name ?? item.action}
                          {item.acceptedProfileId ? ` → ${item.acceptedProfileId}` : ""}
                          {item.acceptedAgentIds?.length
                            ? ` (${item.acceptedAgentIds.length} agents)`
                            : ""}
                        </>
                      ) : (
                        <>
                          <code>{item.action}</code>
                          {item.acceptedPermissionId ? ` → ${item.acceptedPermissionId}` : ""}
                        </>
                      )}
                    </span>
                    <ConfidenceBadge confidence={item.confidence} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Dismissed &amp; postponed</h2>
            {[...visibleData.dismissed, ...visibleData.postponed].length === 0 ? (
              <p className="ops-empty">None.</p>
            ) : (
              <ul className="ops-feed">
                {[...visibleData.dismissed, ...visibleData.postponed].map((item) => (
                  <li key={item.recommendationId} className="ops-feed__row">
                    <span>
                      <code>{item.action}</code> · {item.status}
                      {item.dismissReason ? ` (${item.dismissReason})` : ""}
                      {item.remindAt ? ` · remind ${new Date(item.remindAt).toLocaleDateString()}` : ""}
                    </span>
                    <ConfidenceBadge confidence={item.confidence} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
