import { NextResponse, type NextRequest } from "next/server";
import { getConsoleAuditActor, requireConsoleApi } from "@/lib/adminAuth";
import { recordAdminAudit } from "@/lib/consoleAdmins";
import { randomUUID } from "crypto";
import { createIncident, findStatusIncidents } from "@/lib/repositories/status";

const VALID_INCIDENT_STATUSES = ["investigating", "identified", "watching", "fixed"] as const;
const VALID_SEVERITIES = ["minor", "major", "critical"] as const;
type IncStatus = typeof VALID_INCIDENT_STATUSES[number];
type IncSeverity = typeof VALID_SEVERITIES[number];

export async function GET(request: NextRequest) {
  const authError = await requireConsoleApi(request);
  if (authError) return authError;

  const incidents = await findStatusIncidents({}, { sort: { createdAt: -1 }, select: "-_id incidentId title message status severity componentIds updates resolvedAt createdAt updatedAt" });

  return NextResponse.json({ incidents });
}

export async function POST(request: NextRequest) {
  const authError = await requireConsoleApi(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as {
    title?: string;
    message?: string;
    status?: string;
    severity?: string;
    componentIds?: string[];
  } | null;

  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const status: IncStatus = VALID_INCIDENT_STATUSES.includes(body.status as IncStatus) ? (body.status as IncStatus) : "investigating";
  const severity: IncSeverity = VALID_SEVERITIES.includes(body.severity as IncSeverity) ? (body.severity as IncSeverity) : "minor";

  const incident = await createIncident({
    incidentId: randomUUID(),
    title: body.title.trim().slice(0, 200),
    message: body.message?.trim().slice(0, 2000) ?? undefined,
    status,
    severity,
    componentIds: Array.isArray(body.componentIds) ? body.componentIds : [],
    updates: body.message
      ? [{ body: body.message.trim().slice(0, 2000), status, createdAt: new Date() }]
      : [],
    resolvedAt: status === "fixed" ? new Date() : undefined
  });

  await recordAdminAudit({
    adminId: getConsoleAuditActor(request),
    action: "status_incident.created",
    target: incident.incidentId,
    metadata: { title: incident.title, severity }
  });

  return NextResponse.json(
    {
      incident: {
        incidentId: incident.incidentId,
        title: incident.title,
        message: incident.message,
        status: incident.status,
        severity: incident.severity,
        componentIds: incident.componentIds,
        updates: incident.updates,
        resolvedAt: incident.resolvedAt,
        createdAt: incident.createdAt,
        updatedAt: incident.updatedAt
      }
    },
    { status: 201 }
  );
}
