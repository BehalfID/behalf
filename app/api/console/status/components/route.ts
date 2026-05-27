import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/db";
import StatusComponent from "@/models/StatusComponent";
import { randomUUID } from "crypto";

export async function GET(request: NextRequest) {
  const authError = await requireConsoleApi(request);
  if (authError) return authError;

  await connectToDatabase();

  const components = await StatusComponent.find({})
    .sort({ sortOrder: 1, name: 1 })
    .select("-_id componentId name description group sortOrder status enabled createdAt updatedAt")
    .lean();

  return NextResponse.json({ components });
}

export async function POST(request: NextRequest) {
  const authError = await requireConsoleApi(request);
  if (authError) return authError;

  await connectToDatabase();

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    description?: string;
    group?: string;
    sortOrder?: number;
    status?: string;
  } | null;

  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const validStatuses = ["operational", "performance_issues", "partial_outage", "major_outage"] as const;
  type CompStatus = typeof validStatuses[number];
  const status: CompStatus = validStatuses.includes(body.status as CompStatus) ? (body.status as CompStatus) : "operational";

  const component = await StatusComponent.create({
    componentId: randomUUID(),
    name: body.name.trim().slice(0, 120),
    description: body.description?.trim().slice(0, 500) ?? undefined,
    group: body.group?.trim().slice(0, 80) ?? undefined,
    sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
    status,
    enabled: true
  });

  return NextResponse.json(
    {
      component: {
        componentId: component.componentId,
        name: component.name,
        description: component.description,
        group: component.group,
        sortOrder: component.sortOrder,
        status: component.status,
        enabled: component.enabled,
        createdAt: component.createdAt,
        updatedAt: component.updatedAt
      }
    },
    { status: 201 }
  );
}
