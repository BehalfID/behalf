import { NextResponse } from "next/server";
import { PUBLIC_STATUS_CACHE } from "@/lib/cachePolicy";
import { listComponents, listIncidents } from "@/lib/repositories/status";
import { noCacheJson } from "@/lib/responses";

export async function GET() {
  let components;
  let incidents;
  try {
    [components, incidents] = await Promise.all([
      listComponents({ enabled: true }),
      listIncidents()
    ]);
  } catch {
    return noCacheJson(
      { overall: "operational", groupedComponents: [], incidents: [] },
      { status: 200 }
    );
  }

  incidents = incidents.slice(0, 50);

  // Derive overall system status from component statuses
  const allStatuses = components.map((c) => c.status);
  let overall: string;
  if (allStatuses.includes("major_outage")) {
    overall = "major_outage";
  } else if (allStatuses.includes("partial_outage")) {
    overall = "partial_outage";
  } else if (allStatuses.includes("performance_issues")) {
    overall = "performance_issues";
  } else {
    overall = "operational";
  }

  // Group components by group name
  const groups = new Map<string, typeof components>();
  for (const component of components) {
    const key = component.group ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(component);
  }

  const groupedComponents = Array.from(groups.entries()).map(([group, items]) => ({
    group: group || null,
    components: items
  }));

  const response = NextResponse.json({
    overall,
    groupedComponents,
    incidents
  });
  response.headers.set("Cache-Control", PUBLIC_STATUS_CACHE);
  return response;
}
