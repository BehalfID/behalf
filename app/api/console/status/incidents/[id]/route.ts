import { NextResponse, type NextRequest } from "next/server";
import { getConsoleSessionActorId, requireConsoleApi } from "@/lib/adminAuth";
import { recordAdminAudit } from "@/lib/consoleAdmins";
import {
  findOneAndDeleteStatusIncident,
  findOneStatusIncident,
  updateIncident
} from "@/lib/repositories/status";

const VALID_INCIDENT_STATUSES = ["investigating", "identified", "watching", "fixed"];
const VALID_SEVERITIES = ["minor", "major", "critical"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireConsoleApi(request);
  if (authError) return authError;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    title?: string;
    message?: string;
    status?: string;
    severity?: string;
    componentIds?: string[];
    updateBody?: string;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const incident = await findOneStatusIncident({ incidentId: id });
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};

  if (body.title !== undefined) update.title = body.title.trim().slice(0, 200);
  if (body.message !== undefined) update.message = body.message?.trim().slice(0, 2000);
  if (body.severity !== undefined && VALID_SEVERITIES.includes(body.severity)) {
    update.severity = body.severity;
  }
  if (body.status !== undefined && VALID_INCIDENT_STATUSES.includes(body.status)) {
    update.status = body.status;
    if (body.status === "fixed" && !incident.resolvedAt) {
      update.resolvedAt = new Date();
    } else if (body.status !== "fixed") {
      update.resolvedAt = null;
    }
  }
  if (Array.isArray(body.componentIds)) {
    update.componentIds = body.componentIds;
  }

  if (body.updateBody?.trim()) {
    const status = (update.status as string | undefined) ?? incident.status;
    update.updates = [
      ...(incident.updates ?? []),
      {
        body: body.updateBody.trim().slice(0, 2000),
        status: status as "investigating" | "identified" | "watching" | "fixed",
        createdAt: new Date()
      }
    ];
  }

  const updated = await updateIncident(id, update);
  if (!updated) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  await recordAdminAudit({
    adminId: getConsoleSessionActorId(request),
    action: "status_incident.updated",
    target: id,
    metadata: { status: updated.status, severity: updated.severity }
  });

  return NextResponse.json({
    incident: {
      incidentId: updated.incidentId,
      title: updated.title,
      message: updated.message,
      status: updated.status,
      severity: updated.severity,
      componentIds: updated.componentIds,
      updates: updated.updates,
      resolvedAt: updated.resolvedAt,
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
  const deleted = await findOneAndDeleteStatusIncident({ incidentId: id });
  if (!deleted) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  await recordAdminAudit({
    adminId: getConsoleSessionActorId(request),
    action: "status_incident.deleted",
    target: id,
    metadata: { title: deleted.title }
  });

  return NextResponse.json({ ok: true });
}
