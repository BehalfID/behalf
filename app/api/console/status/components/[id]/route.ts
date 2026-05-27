import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/db";
import StatusComponent from "@/models/StatusComponent";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireConsoleApi(request);
  if (authError) return authError;

  await connectToDatabase();

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    description?: string;
    group?: string;
    sortOrder?: number;
    status?: string;
    enabled?: boolean;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const component = await StatusComponent.findOne({ componentId: id });
  if (!component) {
    return NextResponse.json({ error: "Component not found" }, { status: 404 });
  }

  const validStatuses = ["operational", "performance_issues", "partial_outage", "major_outage"];

  if (body.name !== undefined) component.name = body.name.trim().slice(0, 120);
  if (body.description !== undefined) component.description = body.description?.trim().slice(0, 500);
  if (body.group !== undefined) component.group = body.group?.trim().slice(0, 80);
  if (typeof body.sortOrder === "number") component.sortOrder = body.sortOrder;
  if (body.status !== undefined && validStatuses.includes(body.status)) {
    component.status = body.status as typeof component.status;
  }
  if (typeof body.enabled === "boolean") component.enabled = body.enabled;

  await component.save();

  return NextResponse.json({
    component: {
      componentId: component.componentId,
      name: component.name,
      description: component.description,
      group: component.group,
      sortOrder: component.sortOrder,
      status: component.status,
      enabled: component.enabled,
      updatedAt: component.updatedAt
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireConsoleApi(request);
  if (authError) return authError;

  await connectToDatabase();

  const { id } = await params;
  const deleted = await StatusComponent.findOneAndDelete({ componentId: id });
  if (!deleted) {
    return NextResponse.json({ error: "Component not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
