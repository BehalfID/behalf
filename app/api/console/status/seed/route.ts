/**
 * POST /api/console/status/seed
 * One-time seed of default BehalfID service components.
 * Idempotent — skips components that already exist by name.
 * Console-auth required.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/db";
import StatusComponent from "@/models/StatusComponent";
import { randomUUID } from "crypto";

const DEFAULT_COMPONENTS = [
  { name: "Verification API",    description: "Action verification endpoint — /api/verify",           group: "Core API",            sortOrder: 10 },
  { name: "Action Gateway",      description: "Agent action execution and enforcement",                group: "Core API",            sortOrder: 20 },
  { name: "Authentication",      description: "Login, signup, and session management",                group: "Core API",            sortOrder: 30 },
  { name: "Developer Dashboard", description: "Dashboard portal for managing agents and permissions", group: "Developer Platform",  sortOrder: 40 },
  { name: "Admin Console",       description: "Internal admin console",                               group: "Developer Platform",  sortOrder: 50 },
  { name: "Database",            description: "Primary MongoDB data store",                           group: "Infrastructure",      sortOrder: 60 },
  { name: "Webhook Delivery",    description: "Event delivery and retry pipeline",                    group: "Infrastructure",      sortOrder: 70 },
  { name: "Site Guard",          description: "AI agent website access control",                      group: "Add-ons",             sortOrder: 80 },
  { name: "SDK & CLI",           description: "npm packages — @behalfid/sdk and @behalfid/cli",      group: "Add-ons",             sortOrder: 90 },
] as const;

export async function POST(request: NextRequest) {
  const authError = await requireConsoleApi(request);
  if (authError) return authError;

  await connectToDatabase();

  const results: { name: string; action: "created" | "skipped" }[] = [];

  for (const comp of DEFAULT_COMPONENTS) {
    const existing = await StatusComponent.findOne({ name: comp.name });
    if (existing) {
      results.push({ name: comp.name, action: "skipped" });
      continue;
    }

    await StatusComponent.create({
      componentId: randomUUID(),
      name: comp.name,
      description: comp.description,
      group: comp.group,
      sortOrder: comp.sortOrder,
      status: "operational",
      enabled: true,
    });

    results.push({ name: comp.name, action: "created" });
  }

  const created = results.filter((r) => r.action === "created").length;
  const skipped = results.filter((r) => r.action === "skipped").length;

  return NextResponse.json({ created, skipped, results });
}
