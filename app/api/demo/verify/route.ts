import { NextResponse, type NextRequest } from "next/server";
import { DEMO_SCENARIO_IDS, runDemoScenario, type DemoScenarioId } from "@/lib/demoScenarios";
import { checkDemoRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";

export async function POST(request: NextRequest) {
  const limit = await checkDemoRateLimit(request);
  if (limit.limited) {
    return rateLimitError();
  }

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const scenarioId = typeof body.scenarioId === "string" ? body.scenarioId.trim() : null;
  if (!scenarioId) {
    return jsonError("scenarioId is required.");
  }
  if (!DEMO_SCENARIO_IDS.has(scenarioId)) {
    return jsonError(`Unknown scenarioId: "${scenarioId}".`, 400);
  }

  const result = runDemoScenario(scenarioId as DemoScenarioId);

  return NextResponse.json({
    requestId: result.requestId,
    allowed: result.allowed,
    approvalRequired: result.approvalRequired,
    reason: result.reason,
    risk: result.risk,
    timestamp: result.timestamp,
    scenarioId: result.scenarioId,
    demo: true
  });
}
