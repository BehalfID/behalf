import type { CheckStatus, DoctorCheck } from "../types/index.js";

export function createCheck(
  id: string,
  name: string,
  status: CheckStatus,
  message: string,
  details?: Record<string, unknown>,
): DoctorCheck {
  const check: DoctorCheck = { id, name, status, message };
  if (details !== undefined) {
    check.details = details;
  }
  return check;
}

/** True when the report should be considered healthy (no failing checks). */
export function isHealthy(checks: readonly DoctorCheck[]): boolean {
  return checks.every((check) => check.status !== "fail");
}
