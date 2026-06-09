/**
 * Live test setup helper.
 *
 * Manages the one test permission that live adapter tests rely on for
 * allowed-path coverage:
 *
 *   action:   "send"
 *   resource: "communication.email"
 *
 * Flow:
 *  1. Call /api/verify — if already allowed, return { canRunAllowedTests: true }
 *  2. Otherwise try to create the permission via /api/permissions (agent key)
 *  3. If creation fails, return { canRunAllowedTests: false, reason } so tests
 *     skip with a clear message rather than fail.
 *
 * Permissions are created with a 60-minute expiry so they self-clean. Cleanup
 * via the developer dashboard is also fine.
 *
 * IMPORTANT: the permission resource field is matched against "vendor" internally
 * by the BehalfID verify engine (see /api/verify route line 37). When verifying,
 * pass resource: "communication.email" in the verify input — it maps to vendor.
 */

export const ALLOWED_ACTION = "send";
export const ALLOWED_RESOURCE = "communication.email";

export type LiveSetupResult = {
  canRunAllowedTests: boolean;
  reason?: string;
  seededPermissionId?: string;
};

type VerifyResponse = {
  requestId: string;
  allowed: boolean;
  reason: string;
  risk: string;
};

type CreatePermissionResponse = {
  permissionId: string;
  status: string;
};

async function callVerify(
  baseUrl: string,
  apiKey: string,
  agentId: string,
  action: string,
  resource: string
): Promise<VerifyResponse | null> {
  try {
    const res = await fetch(`${baseUrl}/api/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ agentId, action, resource }),
    });
    if (!res.ok) return null;
    return (await res.json()) as VerifyResponse;
  } catch {
    return null;
  }
}

async function createPermission(
  baseUrl: string,
  apiKey: string,
  agentId: string,
  action: string,
  resource: string
): Promise<{ permissionId: string } | { error: string }> {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1 hour
  try {
    const res = await fetch(`${baseUrl}/api/permissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        agentId,
        action,
        resource,
        description: "Live integration test permission (auto-expires in 1 hour)",
        notes: "Created by test/helpers/live-test-setup.ts",
        constraints: { expiresAt },
      }),
    });
    const data = (await res.json()) as CreatePermissionResponse & { error?: string };
    if (!res.ok || data.error) {
      return { error: data.error ?? `HTTP ${res.status}` };
    }
    return { permissionId: data.permissionId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Ensure the live test permission exists.
 * Call this in a beforeAll block for allowed-path live tests.
 */
export async function ensureLiveTestPermission(): Promise<LiveSetupResult> {
  const baseUrl = process.env.BEHALFID_BASE_URL?.replace(/\/+$/, "");
  const apiKey = process.env.BEHALFID_API_KEY;
  const agentId = process.env.BEHALFID_AGENT_ID;

  if (!baseUrl || !apiKey || !agentId) {
    return {
      canRunAllowedTests: false,
      reason: "Missing BEHALFID_BASE_URL, BEHALFID_API_KEY, or BEHALFID_AGENT_ID",
    };
  }

  // Step 1: check if permission already exists
  const verifyResult = await callVerify(baseUrl, apiKey, agentId, ALLOWED_ACTION, ALLOWED_RESOURCE);

  if (verifyResult?.allowed === true) {
    return { canRunAllowedTests: true };
  }

  // Step 2: try to create it
  const creation = await createPermission(baseUrl, apiKey, agentId, ALLOWED_ACTION, ALLOWED_RESOURCE);

  if ("error" in creation) {
    return {
      canRunAllowedTests: false,
      reason:
        `Could not seed test permission. Create it manually:\n` +
        `  action: "${ALLOWED_ACTION}"\n` +
        `  resource: "${ALLOWED_RESOURCE}"\n` +
        `  (no constraints needed)\n` +
        `Error: ${creation.error}`,
    };
  }

  // Step 3: verify it now works
  const verifyAfter = await callVerify(baseUrl, apiKey, agentId, ALLOWED_ACTION, ALLOWED_RESOURCE);
  if (verifyAfter?.allowed !== true) {
    return {
      canRunAllowedTests: false,
      reason:
        `Permission was created (id=${creation.permissionId}) but verify still returns denied. ` +
        `This may be a race or quota issue. Retry or check dashboard.`,
      seededPermissionId: creation.permissionId,
    };
  }

  return { canRunAllowedTests: true, seededPermissionId: creation.permissionId };
}
