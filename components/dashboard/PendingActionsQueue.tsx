"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { formatOpsTime, type OpsApprovalRequest } from "./opsLogTypes";

type ApprovalsResponse = {
  approvals: OpsApprovalRequest[];
  workspaceAuthority?: { roleLabel: string } | null;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers }
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function actionLabel(action: string, vendor?: string | null) {
  const base = action.replace(/_/g, " ");
  return vendor ? `${base} → ${vendor}` : base;
}

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
  const [data, setData] = useState<ApprovalsResponse | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError("");
    try {
      setData(await api<ApprovalsResponse>("/api/dashboard/approvals?status=pending"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed.");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const resolve = async (approvalId: string, action: "approve" | "deny") => {
    setWorking(approvalId);
    setError("");
    try {
      await api(`/api/dashboard/approvals/${approvalId}/${action}`, { method: "POST" });
      await reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Action failed.");
    } finally {
      setWorking(null);
    }
  };

  const list = data?.approvals ?? [];

  return (
    <div className={`ops-queue${compact ? " ops-queue--compact" : ""}`}>
      {!compact ? (
        <PageHeader
          title={title}
          description={description}
          action={<Button type="button" onClick={() => void reload()}>Refresh</Button>}
          className="dashboard-header"
        />
      ) : null}

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {!data ? (
        <p className="ops-empty">Loading pending actions…</p>
      ) : list.length === 0 ? (
        <EmptyState className="dashboard-empty">
          No pending actions. When an agent hits an approval-required permission, the gated action will appear here for review.
        </EmptyState>
      ) : (
        <div className="ops-queue-table-wrap">
          <table className="ops-queue-table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Agent</th>
                <th scope="col">Action</th>
                <th scope="col">Resource</th>
                <th scope="col">Amount</th>
                <th scope="col">Required role</th>
                <th scope="col">Status</th>
                <th scope="col">Decision</th>
              </tr>
            </thead>
            <tbody>
              {list.map((req) => (
                <tr
                  key={req.approvalId}
                  className={highlightApprovalId === req.approvalId ? "ops-queue-table__row--highlight" : undefined}
                >
                  <td className="ops-log-table__time">{formatOpsTime(req.createdAt)}</td>
                  <td className="ops-log-table__mono">{req.agentName ?? req.agentId}</td>
                  <td className="ops-log-table__mono"><code>{actionLabel(req.action, req.vendor)}</code></td>
                  <td className="ops-log-table__mono">{req.vendor ?? "—"}</td>
                  <td className="ops-log-table__mono">{typeof req.amount === "number" ? `$${req.amount}` : "—"}</td>
                  <td>{req.requiredRoleLabel ?? "—"}</td>
                  <td><span className="ops-log-chip ops-log-chip--approval">Pending</span></td>
                  <td>
                    <div className="ops-queue-actions">
                      <Button
                        variant="primary"
                        type="button"
                        onClick={() => void resolve(req.approvalId, "approve")}
                        disabled={working === req.approvalId || req.canApprove === false}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void resolve(req.approvalId, "deny")}
                        disabled={working === req.approvalId || req.canDeny === false}
                      >
                        Deny
                      </Button>
                    </div>
                    {req.canApprove === false && req.approveBlockReason ? (
                      <small className="form-error">{req.approveBlockReason}</small>
                    ) : null}
                    {req.canDeny === false && req.denyBlockReason ? (
                      <small className="form-error">{req.denyBlockReason}</small>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
