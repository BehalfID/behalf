import { createCheck } from "./checks.js";
import type { DoctorCheck } from "../types/index.js";

export type FetchLike = (
  input: string,
  init?: { method?: string; signal?: AbortSignal },
) => Promise<{ status: number; ok: boolean }>;

export interface ProbeVerifyEndpointOptions {
  url: string;
  fetchImpl?: FetchLike;
  /** Timeout in milliseconds. Defaults to 5000. */
  timeoutMs?: number;
}

/**
 * Probe verify-endpoint connectivity.
 * Any HTTP response (including 4xx) counts as reachable; network errors fail.
 */
export async function probeVerifyEndpoint(
  options: ProbeVerifyEndpointOptions,
): Promise<DoctorCheck> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 5_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(options.url, {
      method: "GET",
      signal: controller.signal,
    });

    if (response.status >= 500) {
      return createCheck(
        "verify-endpoint",
        "Verify endpoint connectivity",
        "warn",
        `Verify endpoint responded with HTTP ${response.status}`,
        { url: options.url, status: response.status },
      );
    }

    return createCheck(
      "verify-endpoint",
      "Verify endpoint connectivity",
      "pass",
      `Verify endpoint reachable (HTTP ${response.status})`,
      { url: options.url, status: response.status },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createCheck(
      "verify-endpoint",
      "Verify endpoint connectivity",
      "fail",
      `Unable to reach verify endpoint: ${message}`,
      { url: options.url },
    );
  } finally {
    clearTimeout(timer);
  }
}
