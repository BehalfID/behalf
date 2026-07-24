import { NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor } from "@/lib/delegatedAuth";
import { noCacheJson } from "@/lib/responses";
import { matchFieldCompletions, matchSmartSuggestions, type SmartSuggestion } from "@/lib/smartSearch";
import VerificationLog from "@/models/VerificationLog";
import { accountScopeFilter } from "@/lib/accountAccess";
import { retentionSince } from "@/lib/quota";

type FacetRow = { action?: string | null; vendor?: string | null; agentId?: string | null };

/**
 * GET /api/dashboard/search/suggest?q=...
 * Returns ranked suggestions across log query templates, docs, app knowledge,
 * plus recent log field facets for the active workspace.
 */
export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return noCacheJson({ suggestions: [] as SmartSuggestion[] });

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const scopeParam = request.nextUrl.searchParams.get("scope")?.trim();
  const scope = scopeParam === "logs" || scopeParam === "docs" ? scopeParam : "all";

  const fieldHits = matchFieldCompletions(q);
  if (fieldHits.length) {
    return noCacheJson({ suggestions: fieldHits });
  }

  let extra: SmartSuggestion[] = [];
  try {
    const retentionStart = retentionSince(auth.account?.plan);
    const filter: Record<string, unknown> = { ...accountScopeFilter(actor.accountId) };
    if (retentionStart) filter.createdAt = { $gte: retentionStart };

    const recent = await VerificationLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(80)
      .select("-_id action vendor agentId")
      .lean<FacetRow[]>();

    const seen = new Set<string>();
    for (const row of recent) {
      if (row.action && !seen.has(`a:${row.action}`)) {
        seen.add(`a:${row.action}`);
        extra.push({
          id: `facet-action-${row.action}`,
          kind: "field",
          title: `action:${row.action}`,
          description: "Recent action in this workspace",
          query: `action:${row.action}`,
          logFilters: { action: row.action, search: "" },
          keywords: [row.action]
        });
      }
      if (row.vendor && !seen.has(`v:${row.vendor}`)) {
        seen.add(`v:${row.vendor}`);
        extra.push({
          id: `facet-vendor-${row.vendor}`,
          kind: "field",
          title: `vendor:${row.vendor}`,
          description: "Recent target in this workspace",
          query: `vendor:${row.vendor}`,
          logFilters: { search: row.vendor },
          keywords: [row.vendor]
        });
      }
      if (row.agentId && !seen.has(`g:${row.agentId}`)) {
        seen.add(`g:${row.agentId}`);
        extra.push({
          id: `facet-agent-${row.agentId}`,
          kind: "field",
          title: `agent:${row.agentId}`,
          description: "Recent agent in this workspace",
          query: `agent:${row.agentId}`,
          logFilters: { agentId: row.agentId, search: "" },
          keywords: [row.agentId]
        });
      }
    }
    extra = extra.slice(0, 24);
  } catch {
    // Catalog suggestions still work if facet lookup fails.
    extra = [];
  }

  const suggestions = matchSmartSuggestions(q, { scope, limit: 10, extra });
  return noCacheJson({ suggestions, facets: extra });
}
