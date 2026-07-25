import { and, asc, desc, eq, ne, type SQL } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { statusComponents, statusIncidents } from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";
import type {
  CreateStatusIncidentInput,
  StatusIncidentUpdateInput
} from "@/lib/repositories/status";

type ComponentRow = typeof statusComponents.$inferSelect;
type ComponentInsert = typeof statusComponents.$inferInsert;
type IncidentRow = typeof statusIncidents.$inferSelect;
type IncidentInsert = typeof statusIncidents.$inferInsert;

export type StatusComponentDomain = ComponentRow;
export type StatusIncidentDomain = {
  incidentId: string;
  title: string;
  message: string | null;
  status: string;
  severity: string;
  componentIds: string[];
  updates: StatusIncidentUpdateInput[];
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function normalizeUpdates(value: unknown): StatusIncidentUpdateInput[] {
  if (!Array.isArray(value)) return [];
  return value as StatusIncidentUpdateInput[];
}

function normalizeIncident(row: IncidentRow): StatusIncidentDomain {
  return {
    incidentId: row.incidentId,
    title: row.title,
    message: row.message,
    status: row.status,
    severity: row.severity,
    componentIds: [...(row.componentIds ?? [])],
    updates: normalizeUpdates(row.updates),
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export async function listComponents(
  db: BehalfPostgresDb,
  options?: { enabled?: boolean }
): Promise<StatusComponentDomain[]> {
  return db.query.statusComponents.findMany({
    where:
      options?.enabled === undefined
        ? undefined
        : eq(statusComponents.enabled, options.enabled),
    orderBy: [asc(statusComponents.sortOrder), asc(statusComponents.name)]
  });
}

export async function createComponent(
  db: BehalfPostgresDb,
  input: Omit<ComponentInsert, "createdAt" | "updatedAt">
) {
  try {
    const [row] = await db.insert(statusComponents).values(input).returning();
    if (!row) throw new Error("createComponent failed to return a row");
    return row;
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function findComponent(
  db: BehalfPostgresDb,
  componentId: string
): Promise<StatusComponentDomain | null> {
  return (
    (await db.query.statusComponents.findFirst({
      where: eq(statusComponents.componentId, componentId)
    })) ?? null
  );
}

export async function updateComponent(
  db: BehalfPostgresDb,
  componentId: string,
  update: Partial<Omit<ComponentInsert, "componentId" | "createdAt" | "updatedAt">>
) {
  const [row] = await db
    .update(statusComponents)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(statusComponents.componentId, componentId))
    .returning();
  return row ?? null;
}

export async function deleteComponent(db: BehalfPostgresDb, componentId: string) {
  const [row] = await db
    .delete(statusComponents)
    .where(eq(statusComponents.componentId, componentId))
    .returning();
  return row ?? null;
}

export async function listIncidents(
  db: BehalfPostgresDb,
  options?: { includeFixed?: boolean }
): Promise<StatusIncidentDomain[]> {
  const rows = await db.query.statusIncidents.findMany({
    where: options?.includeFixed === false ? ne(statusIncidents.status, "fixed") : undefined,
    orderBy: desc(statusIncidents.createdAt)
  });
  return rows.map(normalizeIncident);
}

export async function createIncident(db: BehalfPostgresDb, input: CreateStatusIncidentInput) {
  try {
    const [row] = await db
      .insert(statusIncidents)
      .values({
        incidentId: input.incidentId,
        title: input.title,
        message: input.message,
        status: input.status,
        severity: input.severity,
        componentIds: input.componentIds,
        updates: input.updates ?? [],
        resolvedAt: input.resolvedAt
      })
      .returning();
    if (!row) throw new Error("createIncident failed to return a row");
    return normalizeIncident(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function findIncident(
  db: BehalfPostgresDb,
  incidentId: string
): Promise<StatusIncidentDomain | null> {
  const row =
    (await db.query.statusIncidents.findFirst({
      where: eq(statusIncidents.incidentId, incidentId)
    })) ?? null;
  return row ? normalizeIncident(row) : null;
}

export async function updateIncident(
  db: BehalfPostgresDb,
  incidentId: string,
  update: Partial<
    Omit<IncidentInsert, "incidentId" | "createdAt" | "updatedAt"> & {
      updates?: StatusIncidentUpdateInput[];
    }
  >
) {
  const [row] = await db
    .update(statusIncidents)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(statusIncidents.incidentId, incidentId))
    .returning();
  return row ? normalizeIncident(row) : null;
}

export async function deleteIncident(db: BehalfPostgresDb, incidentId: string) {
  const [row] = await db
    .delete(statusIncidents)
    .where(eq(statusIncidents.incidentId, incidentId))
    .returning();
  return row ? normalizeIncident(row) : null;
}

function buildComponentWhere(filter: Record<string, unknown> = {}): SQL | undefined {
  const conditions: SQL[] = [];
  for (const [key, value] of Object.entries(filter)) {
    if (key === "componentId" && typeof value === "string") {
      conditions.push(eq(statusComponents.componentId, value));
      continue;
    }
    if (key === "enabled" && typeof value === "boolean") {
      conditions.push(eq(statusComponents.enabled, value));
      continue;
    }
    if (key === "status" && typeof value === "string") {
      conditions.push(eq(statusComponents.status, value));
      continue;
    }
    throw new Error(`Unsupported status component filter field: ${key}`);
  }
  return conditions.length ? and(...conditions) : undefined;
}

function buildIncidentWhere(filter: Record<string, unknown> = {}): SQL | undefined {
  const conditions: SQL[] = [];
  for (const [key, value] of Object.entries(filter)) {
    if (key === "incidentId" && typeof value === "string") {
      conditions.push(eq(statusIncidents.incidentId, value));
      continue;
    }
    if (key === "status") {
      if (value && typeof value === "object" && "$ne" in (value as object)) {
        conditions.push(ne(statusIncidents.status, (value as { $ne: string }).$ne));
      } else if (typeof value === "string") {
        conditions.push(eq(statusIncidents.status, value));
      }
      continue;
    }
    throw new Error(`Unsupported status incident filter field: ${key}`);
  }
  return conditions.length ? and(...conditions) : undefined;
}

export async function findStatusComponents(
  db: BehalfPostgresDb,
  filter: Record<string, unknown> = {}
) {
  return db.query.statusComponents.findMany({
    where: buildComponentWhere(filter),
    orderBy: [asc(statusComponents.sortOrder), asc(statusComponents.name)]
  });
}

export async function findOneStatusComponent(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>
) {
  return (
    (await db.query.statusComponents.findFirst({
      where: buildComponentWhere(filter)
    })) ?? null
  );
}

export async function findOneAndDeleteStatusComponent(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>
) {
  const match = await findOneStatusComponent(db, filter);
  if (!match) return null;
  return deleteComponent(db, match.componentId);
}

export async function findStatusIncidents(
  db: BehalfPostgresDb,
  filter: Record<string, unknown> = {}
) {
  const rows = await db.query.statusIncidents.findMany({
    where: buildIncidentWhere(filter),
    orderBy: desc(statusIncidents.createdAt)
  });
  return rows.map(normalizeIncident);
}

export async function findOneStatusIncident(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>
) {
  const row =
    (await db.query.statusIncidents.findFirst({
      where: buildIncidentWhere(filter)
    })) ?? null;
  return row ? normalizeIncident(row) : null;
}

export async function findOneAndDeleteStatusIncident(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>
) {
  const match = await findOneStatusIncident(db, filter);
  if (!match) return null;
  return deleteIncident(db, match.incidentId);
}

export function createPostgresStatusComponentRepository(db: BehalfPostgresDb) {
  return {
    create: (input: Omit<ComponentInsert, "createdAt" | "updatedAt">) =>
      createComponent(db, input),
    find: (filter?: Record<string, unknown>) => findStatusComponents(db, filter),
    findOne: (filter: Record<string, unknown>) => findOneStatusComponent(db, filter),
    findOneAndDelete: (filter: Record<string, unknown>) =>
      findOneAndDeleteStatusComponent(db, filter)
  };
}

export function createPostgresStatusIncidentRepository(db: BehalfPostgresDb) {
  return {
    create: (input: CreateStatusIncidentInput) => createIncident(db, input),
    find: (filter?: Record<string, unknown>) => findStatusIncidents(db, filter),
    findOne: (filter: Record<string, unknown>) => findOneStatusIncident(db, filter),
    findOneAndDelete: (filter: Record<string, unknown>) =>
      findOneAndDeleteStatusIncident(db, filter)
  };
}
