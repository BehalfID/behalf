import { apiRequest, resolveBaseUrl } from "../client.js";
import { requestPauseLease, type PauseLease, type RequestPauseInput } from "./policy.js";

export type PauseApprovalStatus = {
  approvalRequestId: string;
  status: "pending" | "approved" | "denied" | "used" | "expired";
  grantExpiresAt: string | null;
  reason: string;
};

export function dashboardApprovalsUrl(): string {
  return `${resolveBaseUrl()}/dashboard/approvals`;
}

export async function fetchPauseApprovalStatus(
  approvalRequestId: string
): Promise<PauseApprovalStatus> {
  return apiRequest<PauseApprovalStatus>(
    `/api/cli/pause/approvals/${encodeURIComponent(approvalRequestId)}`
  );
}

export function formatPauseApprovalStatusMessage(
  status: PauseApprovalStatus["status"]
): string {
  switch (status) {
    case "pending":
      return "Pause approval is still pending.";
    case "approved":
      return "Pause approval was approved. Retry the same pause command to consume it.";
    case "denied":
      return "Pause approval was denied.";
    case "expired":
      return "Pause approval expired. Request a new pause approval.";
    case "used":
      return "Pause approval was already used.";
  }
}

export const PAUSE_APPROVAL_POLL_INTERVAL_MS = 5_000;
export const DEFAULT_PAUSE_WAIT_TIMEOUT_MS = 10 * 60 * 1_000;
export const MAX_PAUSE_WAIT_TIMEOUT_MS = 30 * 60 * 1_000;

export function parseWaitTimeout(value: string): number {
  const match = /^(\d+)(s|m|h)?$/i.exec(value.trim());
  if (!match) {
    throw new Error("Wait timeout must look like 30s, 2m, or 15m.");
  }
  const amount = Number(match[1]);
  const unit = (match[2] ?? "m").toLowerCase();
  let ms: number;
  if (unit === "s") ms = amount * 1_000;
  else if (unit === "h") ms = amount * 60 * 60 * 1_000;
  else ms = amount * 60 * 1_000;
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error("Wait timeout must be a positive duration.");
  }
  return Math.min(ms, MAX_PAUSE_WAIT_TIMEOUT_MS);
}

export function formatApprovalRequiredLines(lease: PauseLease): string[] {
  const lines = ["Pause requires approval."];
  if (lease.approvalRequestId) {
    lines.push(`Approval request: ${lease.approvalRequestId}`);
  }
  lines.push("Approve it in the dashboard, then retry the same pause command.");
  lines.push(`Dashboard: ${dashboardApprovalsUrl()}`);
  return lines;
}

export class PauseApprovalWaitError extends Error {
  constructor(
    public readonly code: "denied" | "expired" | "used" | "timeout" | "retry_failed",
    message: string
  ) {
    super(message);
  }
}

type WaitDeps = {
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  fetchStatus: (id: string) => Promise<PauseApprovalStatus>;
  requestLease: (input: RequestPauseInput) => Promise<PauseLease>;
};

export async function waitForPauseApprovalGrant(
  approvalRequestId: string,
  pauseInput: RequestPauseInput,
  waitTimeoutMs: number,
  deps: WaitDeps = {
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    fetchStatus: fetchPauseApprovalStatus,
    requestLease: requestPauseLease,
  }
): Promise<PauseLease> {
  const deadline = deps.now() + waitTimeoutMs;

  while (deps.now() < deadline) {
    await deps.sleep(PAUSE_APPROVAL_POLL_INTERVAL_MS);
    const status = await deps.fetchStatus(approvalRequestId);

    if (status.status === "approved") {
      const retry = await deps.requestLease(pauseInput);
      if (retry.granted) return retry;
      throw new PauseApprovalWaitError(
        "retry_failed",
        retry.reason ?? "Pause was not granted after approval."
      );
    }
    if (status.status === "denied") {
      throw new PauseApprovalWaitError("denied", "Pause approval was denied.");
    }
    if (status.status === "expired") {
      throw new PauseApprovalWaitError(
        "expired",
        "Pause approval expired. Request a new pause approval."
      );
    }
    if (status.status === "used") {
      throw new PauseApprovalWaitError("used", "Pause approval was already used.");
    }
  }

  throw new PauseApprovalWaitError(
    "timeout",
    "Timed out waiting for pause approval. Approve it in the dashboard and retry the same pause command."
  );
}
