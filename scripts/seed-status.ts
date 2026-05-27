/**
 * Seed initial BehalfID service components for the status page.
 * Run with: npx tsx scripts/seed-status.ts
 *
 * Safe to run multiple times — skips components that already exist.
 */

import { config } from "dotenv";
import { randomUUID } from "crypto";
import { connectToDatabase } from "../lib/db";
import StatusComponent from "../models/StatusComponent";

config({ path: ".env.local" });
config();

const COMPONENTS: {
  name: string;
  description: string;
  group: string;
  sortOrder: number;
}[] = [
  // Core API
  { name: "Verification API", description: "Action verification endpoint — /api/verify", group: "Core API", sortOrder: 10 },
  { name: "Action Gateway", description: "Agent action execution and enforcement", group: "Core API", sortOrder: 20 },
  { name: "Authentication", description: "Login, signup, and session management", group: "Core API", sortOrder: 30 },

  // Developer Platform
  { name: "Developer Dashboard", description: "Dashboard portal for managing agents and permissions", group: "Developer Platform", sortOrder: 40 },
  { name: "Admin Console", description: "Internal admin console", group: "Developer Platform", sortOrder: 50 },

  // Infrastructure
  { name: "Database", description: "Primary MongoDB data store", group: "Infrastructure", sortOrder: 60 },
  { name: "Webhook Delivery", description: "Event delivery and retry pipeline", group: "Infrastructure", sortOrder: 70 },

  // Add-ons
  { name: "Site Guard", description: "AI agent website access control", group: "Add-ons", sortOrder: 80 },
  { name: "SDK & CLI", description: "npm packages — @behalfid/sdk and @behalfid/cli", group: "Add-ons", sortOrder: 90 },
];

async function main() {
  await connectToDatabase();

  let created = 0;
  let skipped = 0;

  for (const comp of COMPONENTS) {
    const existing = await StatusComponent.findOne({ name: comp.name });
    if (existing) {
      console.log(`  skip  ${comp.name}`);
      skipped++;
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

    console.log(`  created  ${comp.name} [${comp.group}]`);
    created++;
  }

  console.log(`\nDone — ${created} created, ${skipped} already existed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
