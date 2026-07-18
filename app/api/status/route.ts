import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import StatusComponent from "@/models/StatusComponent";
import StatusIncident from "@/models/StatusIncident";
import { PUBLIC_STATUS_CACHE } from "@/lib/cachePolicy";
import { noCacheJson } from "@/lib/responses";

export async function GET() {
  try {
    await connectToDatabase();
  } catch {
    return noCacheJson(
      { overall: "operational", groupedComponents: [], incidents: [] },
      { status: 200 }
    );
  }

  const [components, incidents] = await Promise.all([
    StatusComponent.find({ enabled: true })
      .sort({ sortOrder: 1, name: 1 })
      .select("-_id componentId name description group sortOrder status updatedAt")
      .lean(),
    StatusIncident.find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .select("-_id incidentId title message status severity componentIds updates resolvedAt createdAt updatedAt")
      .lean()
  ]);

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
