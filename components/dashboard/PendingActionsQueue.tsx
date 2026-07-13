"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, PageHeader } from "@/components/ui";
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
  const { apiJson } = useDashboardApi();
  const [data, setData] = useState<ApprovalsResponse | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError("");
    try {
      setData(await apiJson<ApprovalsResponse>("/api/dashboard/approvals?status=pending"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed.");
    }
  }, [apiJson]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const resolve = async (approvalId: string, action: "approve" | "deny") => {
    setWorking(approvalId);
    setError("");
    try {
      await apiJson(`/api/dashboard/approvals/${approvalId}/${action}`, { method: "POST" });
      await reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Action failed.");
    } finally {
      setWorking(null);
    }
  };

  const list = data?.approvals ?? [];

  return (
    <div className={`ops-console ops-queue-console${compact ? " ops-queue-console--compact" : ""}`}>
      {!compact ? (
        <PageHeader
          title={title}
          description={description}
          action={
            <button type="button" className="ops-btn ops-btn--ghost" onClick={() => void reload()}>
              Refresh
            </button>
          }
          className="dashboard-header ops-console__header"
        />
      ) : null}

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {!data ? (
        <p className="ops-console__empty">Loading pending actions…</p>
      ) : list.length === 0 ? (
        <EmptyState className="dashboard-empty">
          No pending actions. When an agent hits an approval-required permission, the gated action will appear here for review.
        </EmptyState>
      ) : (
        <>
          <div className="ops-queue-list ops-queue-list--desktop">
            {list.map((req) => (
              <OpsApprovalQueueRow
                key={req.approvalId}
                req={req}
                working={working === req.approvalId}
                highlight={highlightApprovalId === req.approvalId}
                onApprove={() => void resolve(req.approvalId, "approve")}
                onDeny={() => void resolve(req.approvalId, "deny")}
              />
            ))}
          </div>
          <div className="ops-queue-list ops-queue-list--mobile">
            {list.map((req) => (
              <OpsApprovalCard
                key={req.approvalId}
                req={req}
                working={working === req.approvalId}
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
