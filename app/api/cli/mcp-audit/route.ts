import type { NextRequest } from "next/server";
import { requireCliAuthStrict } from "@/lib/cliAuth";
import { saveMcpAuditSnapshot } from "@/lib/mcpEcosystemService";
import { wrapGuidanceForInventory } from "@/lib/mcpEcosystem";
import { readJsonObject } from "@/lib/request";
import { jsonError, noCacheJson } from "@/lib/responses";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const authResult = await requireCliAuthStrict(request);
  if (authResult.error || !authResult.auth) return authResult.error;

  const accountId = authResult.auth.accountId;
  if (!accountId) {
    return jsonError(
      "No workspace account associated with these credentials. Log in with `behalf login` or use an agent key owned by a workspace.",
      403
    );
  }

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const config = body.config ?? body.mcpConfig;
  if (config === undefined) {
    return jsonError("Provide a `config` object (MCP host JSON with mcpServers or servers).");
  }

  const sourcePath = typeof body.sourcePath === "string" ? body.sourcePath : ".mcp.json";

  try {
    const result = await saveMcpAuditSnapshot({
      accountId,
      rawConfig: config,
      sourcePath,
      syncSource: "cli",
    });

    return noCacheJson({
      ok: true,
      snapshot: result.snapshot,
      report: result.report,
      inventory: result.inventory,
      guidance: wrapGuidanceForInventory(
        result.inventory,
        process.env.NEXT_PUBLIC_APP_URL ?? undefined
      ),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to audit MCP configuration.";
    return jsonError(message, 400);
  }
}
