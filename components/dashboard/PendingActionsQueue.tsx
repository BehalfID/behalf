"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, DashboardState, PageHeader, PageLoadingState, RefreshingIndicator } from "@/components/ui";
import { useDashboardApi } from "@/components/workspace/WorkspaceProvider";
import { OpsApprovalCard, OpsApprovalQueueRow } from "./OpsEventPrimitives";
import { type OpsApprovalRequest } from "./opsLogTypes";

type ApprovalsResponse = {
  approvals: OpsApprovalRequest[];
  workspaceAuthority?: { roleLabel: string } | null;
};

export function PendingActionsQueue({
  title = "Pending actions",
  description = "Gated agent actions waiting for a human approve or deny decision.",
  compact = false,
  highlightApprovalId
}: {
  title?: string;
  description?: string;
  compact?: boolean;
  highlightApprovalId?: string | null;
}) {
  const { apiJson, workspaceSlug } = useDashboardApi();
  const [data, setData] = useState<ApprovalsResponse | null>(null);
  const [dataWorkspaceSlug, setDataWorkspaceSlug] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [errorWorkspaceSlug, setErrorWorkspaceSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<{ approvalId: string; action: "approve" | "deny" } | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    setErrorWorkspaceSlug(workspaceSlug);
    try {
      const result = await apiJson<ApprovalsResponse>("/api/dashboard/approvals?status=pending");
      if (requestId.current !== id) return;
      setData(result);
      setDataWorkspaceSlug(workspaceSlug);
    } catch (requestError) {
      if (requestId.current !== id) return;
      setError(requestError instanceof Error ? requestError.message : "Request failed.");
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }, [apiJson, workspaceSlug]);

  useEffect(() => {
    // Preserve the established automatic approval-queue fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const resolve = async (approvalId: string, action: "approve" | "deny") => {
    setWorking({ approvalId, action });
    setError("");
    setStatusMessage("");
    try {
      await apiJson(`/api/dashboard/approvals/${approvalId}/${action}`, { method: "POST" });
      await reload();
      setStatusMessage(
        action === "approve"
          ? "Request approved. The grant remains bound to the original request and can be consumed once."
          : "Request denied. The agent action remains blocked."
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Action failed.");
    } finally {
      setWorking(null);
    }
  };

  const visibleData = dataWorkspaceSlug === workspaceSlug ? data : null;
  const visibleError = errorWorkspaceSlug === workspaceSlug ? error : "";
  const initialLoading = loading || (!visibleData && !visibleError);
  const list = visibleData?.approvals ?? [];

  return (
    <div className={`ops-console ops-queue-console${compact ? " ops-queue-console--compact" : ""}`}>
      {!compact ? (
        <PageHeader
          eyebrow="Human decision queue"
          title={title}
          description={description}
          status={visibleData ? <Badge variant={list.length ? "warning" : "outline"}>{list.length} pending</Badge> : null}
          action={
            <Button type="button" variant="outline" size="small" onClick={() => void reload()} loading={loading && Boolean(visibleData)}>
              Refresh
            </Button>
          }
          className="dashboard-header ops-console__header"
        />
      ) : null}

      {!compact && visibleData ? (
        <dl className="ops-queue-context" aria-label="Approval queue context">
          <div><dt>Waiting</dt><dd>{list.length}</dd></div>
          <div><dt>Your authority</dt><dd>{visibleData.workspaceAuthority?.roleLabel ?? "Workspace member"}</dd></div>
          <div><dt>Grant behavior</dt><dd>Bound and single-use</dd></div>
        </dl>
      ) : null}

      {statusMessage ? <Alert tone="success" className="ops-feedback">{statusMessage}</Alert> : null}
      {visibleError && visibleData ? <Alert tone="destructive" className="ops-feedback">{visibleError}</Alert> : null}
      {loading && visibleData ? <RefreshingIndicator label="Refreshing pending approvals" /> : null}

      {initialLoading && !visibleData ? (
        <PageLoadingState label="Loading pending approvals" variant="table" />
      ) : !visibleData ? (
        <DashboardState
          kind="error"
          title="Approval queue unavailable"
          description={visibleError || "The approval queue could not be loaded."}
          action={<Button type="button" variant="outline" size="small" onClick={() => void reload()}>Try again</Button>}
        />
      ) : list.length === 0 ? (
        <DashboardState
          kind="empty"
          title="No pending approvals"
          description="When an identified agent reaches an approval-required permission, the bound request will appear here for review."
        />
      ) : (
        <>
          <div className="ops-queue-list ops-queue-list--desktop" role="list" aria-label="Pending approval requests">
            {list.map((req) => (
              <OpsApprovalQueueRow
                key={req.approvalId}
                req={req}
                workingAction={working?.approvalId === req.approvalId ? working.action : null}
                highlight={highlightApprovalId === req.approvalId}
                onApprove={() => void resolve(req.approvalId, "approve")}
                onDeny={() => void resolve(req.approvalId, "deny")}
              />
            ))}
          </div>
          <div className="ops-queue-list ops-queue-list--mobile" role="list" aria-label="Pending approval requests">
            {list.map((req) => (
              <OpsApprovalCard
                key={req.approvalId}
                req={req}
                workingAction={working?.approvalId === req.approvalId ? working.action : null}
                highlight={highlightApprovalId === req.approvalId}
                onApprove={() => void resolve(req.approvalId, "approve")}
                onDeny={() => void resolve(req.approvalId, "deny")}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
