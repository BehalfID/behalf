import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/db";
import StatusIncident from "@/models/StatusIncident";

const VALID_INCIDENT_STATUSES = ["investigating", "identified", "watching", "fixed"];
const VALID_SEVERITIES = ["minor", "major", "critical"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireConsoleApi(request);
  if (authError) return authError;

  await connectToDatabase();

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

  const incident = await StatusIncident.findOne({ incidentId: id });
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  if (body.title !== undefined) incident.title = body.title.trim().slice(0, 200);
  if (body.message !== undefined) incident.message = body.message?.trim().slice(0, 2000);
  if (body.severity !== undefined && VALID_SEVERITIES.includes(body.severity)) {
    incident.severity = body.severity as typeof incident.severity;
  }
  if (body.status !== undefined && VALID_INCIDENT_STATUSES.includes(body.status)) {
    incident.status = body.status as typeof incident.status;
    if (body.status === "fixed" && !incident.resolvedAt) {
      incident.resolvedAt = new Date();
    } else if (body.status !== "fixed") {
      incident.resolvedAt = undefined;
    }
  }
  if (Array.isArray(body.componentIds)) {
    incident.componentIds = body.componentIds;
  }

  // Append an update entry if updateBody is provided
  if (body.updateBody?.trim()) {
    incident.updates.push({
      body: body.updateBody.trim().slice(0, 2000),
      status: (incident.status as "investigating" | "identified" | "watching" | "fixed"),
      createdAt: new Date()
    } as typeof incident.updates[number]);
  }

  await incident.save();

  return NextResponse.json({
    incident: {
      incidentId: incident.incidentId,
      title: incident.title,
      message: incident.message,
      status: incident.status,
      severity: incident.severity,
      componentIds: incident.componentIds,
      updates: incident.updates,
      resolvedAt: incident.resolvedAt,
      updatedAt: incident.updatedAt
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
  const deleted = await StatusIncident.findOneAndDelete({ incidentId: id });
  if (!deleted) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
