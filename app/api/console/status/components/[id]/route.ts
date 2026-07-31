import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import {
  findOneAndDeleteStatusComponent,
  findOneStatusComponent,
  updateComponent
} from "@/lib/repositories/status";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireConsoleApi(request);
  if (authError) return authError;

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

  const component = await findOneStatusComponent({ componentId: id });
  if (!component) {
    return NextResponse.json({ error: "Component not found" }, { status: 404 });
  }

  const validStatuses = ["operational", "performance_issues", "partial_outage", "major_outage"];
  const update: Record<string, unknown> = {};

  if (body.name !== undefined) update.name = body.name.trim().slice(0, 120);
  if (body.description !== undefined) update.description = body.description?.trim().slice(0, 500);
  if (body.group !== undefined) update.group = body.group?.trim().slice(0, 80);
  if (typeof body.sortOrder === "number") update.sortOrder = body.sortOrder;
  if (body.status !== undefined && validStatuses.includes(body.status)) {
    update.status = body.status;
  }
  if (typeof body.enabled === "boolean") update.enabled = body.enabled;

  const updated = await updateComponent(id, update);
  if (!updated) {
    return NextResponse.json({ error: "Component not found" }, { status: 404 });
  }

  return NextResponse.json({
    component: {
      componentId: updated.componentId,
      name: updated.name,
      description: updated.description,
      group: updated.group,
      sortOrder: updated.sortOrder,
      status: updated.status,
      enabled: updated.enabled,
      updatedAt: updated.updatedAt
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireConsoleApi(request);
  if (authError) return authError;

  const { id } = await params;
  const deleted = await findOneAndDeleteStatusComponent({ componentId: id });
  if (!deleted) {
    return NextResponse.json({ error: "Component not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
