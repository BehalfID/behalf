import { type NextRequest } from "next/server";
import { getRequestAccountId, requireDeveloperApi, requireVerifiedDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor, serializeWorkspaceAuthority } from "@/lib/delegatedAuth";
import { emptyOverview, wrapGuidanceForInventory } from "@/lib/mcpEcosystem";
import { getMcpEcosystemOverview, saveMcpAuditSnapshot } from "@/lib/mcpEcosystemService";
import { readJsonObject } from "@/lib/request";
import { jsonError, noCacheJson } from "@/lib/responses";
import { requireWorkspaceMutationActor } from "@/lib/workspaceActor";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const accountId = getRequestAccountId(auth);
  if (!accountId) return jsonError("Workspace account required.", 403);

  const actor = await getWorkspaceActor(auth.user.userId, accountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const overview = await getMcpEcosystemOverview(accountId);
  const guidance = overview.snapshot?.inventory
    ? wrapGuidanceForInventory(
        overview.snapshot.inventory,
        process.env.NEXT_PUBLIC_APP_URL ?? undefined
      )
    : {
        wrapAllCommand: overview.wrapDefaults.installCommand,
        wrapSelectedCommand: null,
        serversToWrap: [] as string[],
        catalog: overview.catalog,
      };

  return noCacheJson({
    ...overview,
    guidance,
    canEdit: actor.role !== "VIEWER",
    workspaceAuthority: serializeWorkspaceAuthority(actor),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireVerifiedDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const accountId = getRequestAccountId(auth);
  if (!accountId) return jsonError("Workspace account required.", 403);

  const actorCheck = await requireWorkspaceMutationActor(auth.user, accountId);
  if (actorCheck.error) return actorCheck.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const config = body.config ?? body.mcpConfig;
  if (config === undefined) {
    return jsonError("Provide a `config` object (MCP host JSON with mcpServers or servers).");
  }

  const sourcePath = typeof body.sourcePath === "string" ? body.sourcePath : ".mcp.json";
  const syncSource = body.syncSource === "cli" ? "cli" : "dashboard";

  try {
    const result = await saveMcpAuditSnapshot({
      accountId,
      rawConfig: config,
      sourcePath,
      syncSource,
    });

    const base = emptyOverview();
    const guidance = wrapGuidanceForInventory(
      result.inventory,
      process.env.NEXT_PUBLIC_APP_URL ?? undefined
    );

    return noCacheJson({
      ok: true,
      ...base,
      snapshot: result.snapshot,
      report: result.report,
      inventory: result.inventory,
      guidance,
      canEdit: true,
      workspaceAuthority: serializeWorkspaceAuthority(actorCheck.actor!),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to audit MCP configuration.";
    return jsonError(message, 400);
  }
}
