/**
 * Public status aggregation.
 *
 * Rules this module exists to enforce:
 *  - Every dependency is probed independently; one failure never hides another.
 *  - Every probe is bounded, read-only, and cheap. No writes, no scans.
 *  - Nothing is reported "operational" just because this process is running.
 *  - When a dependency cannot be measured (missing config, wrong backend,
 *    timeout) the answer is "unknown", never a guess.
 *  - Only fixed, reviewed strings reach the public payload. Driver messages,
 *    stack traces, hostnames, and topology stay in the server log.
 *  - No HTTP is issued, so the status page can never call itself.
 */

import { connectToDatabase } from "@/lib/db";
import { isPostgresConfigured } from "@/lib/db/postgres";
import { logger } from "@/lib/logger";
import {
  isPostgresRuntimeEnabled
} from "@/lib/repositories/backend";
import { findOneApproval } from "@/lib/repositories/approvals";
import { findOnePermission } from "@/lib/repositories/permissions";
import { findBySessionId } from "@/lib/repositories/sessions";
import { listComponents, listIncidents } from "@/lib/repositories/status";

export type HealthState =
  | "operational"
  | "degraded"
  | "partial_outage"
  | "major_outage"
  | "unknown";

export type ServiceHealth = {
  id: string;
  name: string;
  description: string;
  group: string;
  state: HealthState;
  /** Fixed, reviewed copy. Never derived from a driver or error message. */
  detail: string;
  /** Core services drive the overall headline; add-ons only degrade it. */
  core: boolean;
  latencyMs: number | null;
};

export type PublicIncidentUpdate = {
  status: string;
  body: string;
  createdAt: string;
};

export type PublicIncident = {
  id: string;
  title: string;
  message: string | null;
  status: string;
  severity: string;
  resolved: boolean;
  createdAt: string;
  resolvedAt: string | null;
  updates: PublicIncidentUpdate[];
};

export type SystemStatus = {
  overall: HealthState;
  services: ServiceHealth[];
  groups: { group: string; services: ServiceHealth[] }[];
  activeIncidents: PublicIncident[];
  resolvedIncidents: PublicIncident[];
  /** True when the operator incident model could not be read. */
  incidentsUnavailable: boolean;
  checkedAt: string;
};

/** Per-probe ceiling. Kept well under any sane page/route timeout. */
export const PROBE_TIMEOUT_MS = 2_000;
/** Ceiling for the whole aggregation, including the connection handshake. */
export const AGGREGATE_TIMEOUT_MS = 4_000;
/** Above this a reachable dependency is reported as degraded rather than healthy. */
export const SLOW_PROBE_MS = 1_000;

const TIMEOUT = Symbol("probe-timeout");

/**
 * Races a probe against a deadline. Rejections and timeouts both resolve, so a
 * single failing dependency can never reject the aggregate.
 */
async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number
): Promise<{ ok: true; value: T } | { ok: false; timedOut: boolean; error: unknown }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      operation().then((value) => ({ ok: true as const, value })),
      new Promise<typeof TIMEOUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
      })
    ]);

    if (result === TIMEOUT) {
      return { ok: false, timedOut: true, error: null };
    }
    return result;
  } catch (error) {
    return { ok: false, timedOut: false, error };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type ProbeOutcome = {
  /** reachable | slow | down | unmeasurable */
  result: "reachable" | "slow" | "down" | "unmeasurable";
  latencyMs: number | null;
};

/**
 * Runs one bounded read against a dependency. `maxTimeMS` bounds the work on
 * the database side; `withTimeout` bounds the wait on this side.
 */
async function probe(
  id: string,
  operation: () => Promise<unknown>
): Promise<ProbeOutcome> {
  const startedAt = Date.now();
  const outcome = await withTimeout(operation, PROBE_TIMEOUT_MS);
  const latencyMs = Date.now() - startedAt;

  if (outcome.ok) {
    return {
      result: latencyMs > SLOW_PROBE_MS ? "slow" : "reachable",
      latencyMs
    };
  }

  // Full detail goes to the log only. logger redacts secrets before emitting.
  logger.error("status.probe_failed", {
    probe: id,
    timedOut: outcome.timedOut,
    latencyMs,
    reason: outcome.timedOut
      ? "probe exceeded deadline"
      : errorKind(outcome.error)
  });

  return { result: "down", latencyMs };
}

/** Coarse error class for logs. Deliberately not the raw message. */
function errorKind(error: unknown): string {
  if (error instanceof Error) return error.name || "Error";
  return typeof error;
}

function isConfigured(value: string | undefined | null): boolean {
  return Boolean(value && value.trim());
}

const DETAIL = {
  operational: "Responding normally.",
  slow: "Responding slower than usual.",
  down: "Not responding.",
  dependencyDown: "Unavailable while the database is down.",
  dependencySlow: "Slower than usual while the database is degraded.",
  dependencyUnknown: "Cannot be measured while the database state is unknown.",
  notConfigured: "Not configured in this environment.",
  notMeasurable: "Not measurable from this deployment.",
  webServing: "Serving requests from this region.",
  docsServing: "Served as static content by the web tier."
} as const;

function stateFromProbe(outcome: ProbeOutcome, coreOutage: HealthState): {
  state: HealthState;
  detail: string;
} {
  switch (outcome.result) {
    case "reachable":
      return { state: "operational", detail: DETAIL.operational };
    case "slow":
      return { state: "degraded", detail: DETAIL.slow };
    case "down":
      return { state: coreOutage, detail: DETAIL.down };
    case "unmeasurable":
      return { state: "unknown", detail: DETAIL.notMeasurable };
  }
}

/**
 * Derives a dependent service's state from the database result, so a downstream
 * service is never reported healthier than the store it needs.
 */
function dependentState(database: HealthState): { state: HealthState; detail: string } {
  switch (database) {
    case "operational":
      return { state: "operational", detail: DETAIL.operational };
    case "degraded":
      return { state: "degraded", detail: DETAIL.dependencySlow };
    case "unknown":
      return { state: "unknown", detail: DETAIL.dependencyUnknown };
    default:
      return { state: "major_outage", detail: DETAIL.dependencyDown };
  }
}

const STATE_RANK: Record<HealthState, number> = {
  operational: 0,
  unknown: 1,
  degraded: 2,
  partial_outage: 3,
  major_outage: 4
};

function worst(a: HealthState, b: HealthState): HealthState {
  return STATE_RANK[a] >= STATE_RANK[b] ? a : b;
}

/**
 * Overall headline.
 *
 * Core services decide the headline; add-ons can only pull it down to a partial
 * outage. "operational" requires every core service to be positively measured —
 * an unmeasured core service yields "unknown" (nothing measured) or "degraded"
 * (something measured, but not all of it).
 */
export function deriveOverallStatus(services: ServiceHealth[]): HealthState {
  if (services.length === 0) return "unknown";

  const core = services.filter((service) => service.core);
  const pool = core.length > 0 ? core : services;

  if (pool.every((service) => service.state === "unknown")) return "unknown";

  const down = pool.filter(
    (service) => service.state === "major_outage" || service.state === "partial_outage"
  );
  if (down.length > 0) {
    const allDown = down.length === pool.length;
    const anyMajor = down.some((service) => service.state === "major_outage");
    return allDown && anyMajor ? "major_outage" : "partial_outage";
  }

  const addOnsDown = services.some(
    (service) =>
      !service.core &&
      (service.state === "major_outage" || service.state === "partial_outage")
  );
  if (addOnsDown) return "partial_outage";

  if (pool.some((service) => service.state === "degraded")) return "degraded";
  // Something is unmeasured, so "operational" would be an overstatement.
  if (pool.some((service) => service.state === "unknown")) return "degraded";
  if (services.some((service) => service.state === "degraded")) return "degraded";

  return "operational";
}

function toIsoString(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date(0).toISOString();
}

/** Trusts the schema enum for status/severity but never the shape of legacy rows. */
function toPublicIncident(raw: Record<string, unknown>, index: number): PublicIncident {
  const status = typeof raw.status === "string" ? raw.status : "investigating";
  const updates = Array.isArray(raw.updates) ? raw.updates : [];

  return {
    id: typeof raw.incidentId === "string" ? raw.incidentId : `incident-${index}`,
    title: typeof raw.title === "string" ? raw.title : "Service incident",
    message: typeof raw.message === "string" && raw.message ? raw.message : null,
    status,
    severity: typeof raw.severity === "string" ? raw.severity : "minor",
    resolved: status === "fixed",
    createdAt: toIsoString(raw.createdAt),
    resolvedAt: raw.resolvedAt ? toIsoString(raw.resolvedAt) : null,
    updates: updates.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const update = entry as Record<string, unknown>;
      return [
        {
          status: typeof update.status === "string" ? update.status : status,
          body: typeof update.body === "string" ? update.body : "",
          createdAt: toIsoString(update.createdAt)
        }
      ];
    })
  };
}

/** Operator-declared component states, used to pull a live result down only. */
const OPERATOR_STATE: Record<string, HealthState> = {
  operational: "operational",
  performance_issues: "degraded",
  partial_outage: "partial_outage",
  major_outage: "major_outage"
};

/**
 * Maps an operator-managed StatusComponent onto a live service id where the two
 * describe the same thing, so a manual override is respected.
 */
const OPERATOR_COMPONENT_TO_SERVICE: Record<string, string> = {
  "verification-api": "verification",
  "action-gateway": "public-api",
  authentication: "auth",
  "developer-dashboard": "web",
  database: "database",
  "site-guard": "site-guard",
  "sdk-cli": "sdk-cli",
  "webhook-delivery": "webhooks"
};

function normalizeComponentKey(component: Record<string, unknown>): string {
  const name = typeof component.name === "string" ? component.name : "";
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Probes every dependency and returns the public status payload.
 *
 * Never throws: any unexpected failure degrades to an all-unknown payload so
 * the status page renders instead of falling through to an error boundary.
 */
export async function getSystemStatus(): Promise<SystemStatus> {
  const checkedAt = new Date().toISOString();
  try {
    return await withAggregateBudget(checkedAt);
  } catch (error) {
    logger.error("status.aggregate_failed", { reason: errorKind(error) });
    return unknownStatus(checkedAt);
  }
}

async function withAggregateBudget(checkedAt: string): Promise<SystemStatus> {
  const outcome = await withTimeout(() => aggregate(checkedAt), AGGREGATE_TIMEOUT_MS);
  if (outcome.ok) return outcome.value;

  logger.error("status.aggregate_unavailable", {
    timedOut: outcome.timedOut,
    reason: outcome.timedOut ? "aggregate exceeded deadline" : errorKind(outcome.error)
  });
  return unknownStatus(checkedAt);
}

async function aggregate(checkedAt: string): Promise<SystemStatus> {
  const postgresRuntime = isPostgresRuntimeEnabled();
  const databaseConfigured = postgresRuntime
    ? isPostgresConfigured()
    : isConfigured(process.env.MONGODB_URI);
  const webConfigured =
    isConfigured(process.env.APP_BASE_URL) || isConfigured(process.env.NEXT_PUBLIC_APP_URL);

  const connection = databaseConfigured
    ? await probe("database.connect", async () => {
        if (postgresRuntime) {
          const { getPostgresDb } = await import("@/lib/db/postgres");
          const { sql } = await import("drizzle-orm");
          const db = getPostgresDb();
          await db.execute(sql`select 1`);
          return null;
        }
        return connectToDatabase();
      })
    : null;

  let databaseProbe: ProbeOutcome;
  if (!databaseConfigured) {
    databaseProbe = { result: "unmeasurable", latencyMs: null };
  } else if (connection && connection.result === "down") {
    databaseProbe = connection;
  } else if (postgresRuntime) {
    // Postgres connect probe already executed `select 1`.
    databaseProbe = connection ?? { result: "reachable", latencyMs: null };
  } else {
    databaseProbe = await probe("database.ping", async () => {
      const mongoose = await import("mongoose");
      const db = mongoose.default.connection.db;
      if (!db) throw new Error("no active connection");
      return db.admin().ping();
    });
  }

  const database = databaseConfigured
    ? stateFromProbe(databaseProbe, "major_outage")
    : { state: "unknown" as HealthState, detail: DETAIL.notConfigured };

  // Dependent probes only run when the store is actually reachable; otherwise
  // their state is derived, which avoids piling timeouts onto a known outage.
  const canProbeStores = database.state === "operational" || database.state === "degraded";

  const [sessions, permissions, approvals] = canProbeStores
    ? await Promise.all([
        probeStore("auth.sessions", "sessions", () => findBySessionId("__status_probe__")),
        probeStore("verification.permissions", "permissions", () => findOnePermission({})),
        probeStore("approvals.requests", "approvals", () => findOneApproval({}))
      ])
    : [null, null, null];

  const services: ServiceHealth[] = [
    {
      id: "web",
      name: "Dashboard & web",
      description: "Marketing site, dashboard shell, and console pages",
      group: "Web",
      core: true,
      ...(webConfigured
        ? { state: "operational" as HealthState, detail: DETAIL.webServing, latencyMs: null }
        : { state: "unknown" as HealthState, detail: DETAIL.notConfigured, latencyMs: null })
    },
    {
      id: "docs",
      name: "Documentation",
      description: "Public developer documentation",
      group: "Web",
      core: false,
      ...(webConfigured
        ? { state: "operational" as HealthState, detail: DETAIL.docsServing, latencyMs: null }
        : { state: "unknown" as HealthState, detail: DETAIL.notConfigured, latencyMs: null })
    },
    {
      id: "public-api",
      name: "Public API",
      description: "Agents, permissions, logs, and token endpoints",
      group: "API",
      core: true,
      ...resolveDependent(database.state, permissions),
      latencyMs: permissions?.latencyMs ?? null
    },
    {
      id: "verification",
      name: "Verification API",
      description: "Action verification and policy runtime — /api/verify",
      group: "API",
      core: true,
      ...resolveDependent(database.state, permissions),
      latencyMs: permissions?.latencyMs ?? null
    },
    {
      id: "auth",
      name: "Authentication",
      description: "Login, signup, and session management",
      group: "API",
      core: true,
      ...resolveDependent(database.state, sessions),
      latencyMs: sessions?.latencyMs ?? null
    },
    {
      id: "approvals",
      name: "Approval service",
      description: "Approval requests, grants, and decision delivery",
      group: "API",
      core: true,
      ...resolveDependent(database.state, approvals),
      latencyMs: approvals?.latencyMs ?? null
    },
    {
      id: "database",
      name: "Database",
      description: "Primary data store",
      group: "Infrastructure",
      core: true,
      state: database.state,
      detail: database.detail,
      latencyMs: databaseProbe.latencyMs
    }
  ];

  const incidentData = canProbeStores
    ? await readOperatorData()
    : { components: [], incidents: [], unavailable: !canProbeStores };

  const withOverrides = applyOperatorOverrides(services, incidentData.components);
  const incidents = incidentData.incidents;

  return {
    overall: worst(
      deriveOverallStatus(withOverrides),
      incidentSeverityFloor(incidents.filter((incident) => !incident.resolved))
    ),
    services: withOverrides,
    groups: groupServices(withOverrides),
    activeIncidents: incidents.filter((incident) => !incident.resolved),
    resolvedIncidents: incidents.filter((incident) => incident.resolved),
    incidentsUnavailable: incidentData.unavailable,
    checkedAt
  };
}

/**
 * A declared, unresolved incident cannot coexist with an "all clear" headline,
 * so it establishes a floor for the overall state.
 */
function incidentSeverityFloor(active: PublicIncident[]): HealthState {
  if (active.length === 0) return "operational";
  if (active.some((incident) => incident.severity === "critical")) return "major_outage";
  if (active.some((incident) => incident.severity === "major")) return "partial_outage";
  return "degraded";
}

async function probeStore(
  id: string,
  _aggregateName: "approvals" | "permissions" | "sessions",
  operation: () => Promise<unknown>
): Promise<ProbeOutcome> {
  return probe(id, operation);
}

function resolveDependent(
  database: HealthState,
  outcome: ProbeOutcome | null
): { state: HealthState; detail: string } {
  if (!outcome) return dependentState(database);
  if (outcome.result === "unmeasurable") {
    return { state: "unknown", detail: DETAIL.notMeasurable };
  }
  const direct = stateFromProbe(outcome, "major_outage");
  // Never report a dependent service healthier than its store.
  const state = worst(direct.state, database === "operational" ? "operational" : database);
  return {
    state,
    detail: state === direct.state ? direct.detail : dependentState(database).detail
  };
}

async function readOperatorData(): Promise<{
  components: Record<string, unknown>[];
  incidents: PublicIncident[];
  unavailable: boolean;
}> {
  const [components, incidents] = await Promise.all([
    withTimeout(() => listComponents({ enabled: true }), PROBE_TIMEOUT_MS),
    withTimeout(() => listIncidents({ includeFixed: true }), PROBE_TIMEOUT_MS)
  ]);

  if (!components.ok) {
    logger.error("status.components_unavailable", { timedOut: components.timedOut });
  }
  if (!incidents.ok) {
    logger.error("status.incidents_unavailable", { timedOut: incidents.timedOut });
  }

  return {
    components: components.ok ? (components.value as Record<string, unknown>[]) : [],
    incidents: incidents.ok
      ? (incidents.value as Record<string, unknown>[]).map(toPublicIncident)
      : [],
    unavailable: !incidents.ok
  };
}

/**
 * Operator overrides can only make a service look worse. A stale "operational"
 * row must never mask a failing live probe.
 */
function applyOperatorOverrides(
  services: ServiceHealth[],
  components: Record<string, unknown>[]
): ServiceHealth[] {
  if (components.length === 0) return services;

  const overrides = new Map<string, HealthState>();
  const extras: ServiceHealth[] = [];

  for (const component of components) {
    const key = normalizeComponentKey(component);
    const declared = OPERATOR_STATE[String(component.status)] ?? "unknown";
    const serviceId = OPERATOR_COMPONENT_TO_SERVICE[key];

    if (serviceId) {
      overrides.set(serviceId, worst(overrides.get(serviceId) ?? "operational", declared));
      continue;
    }

    // Operator-only components (add-ons) are surfaced but never core.
    if (declared !== "operational") {
      extras.push({
        id: key || `component-${extras.length}`,
        name: typeof component.name === "string" ? component.name : "Service",
        description: "Reported by BehalfID operations",
        group: "Add-ons",
        state: declared,
        detail: "Status reported by our operations team.",
        core: false,
        latencyMs: null
      });
    }
  }

  const merged = services.map((service) => {
    const declared = overrides.get(service.id);
    if (!declared || declared === "operational") return service;
    const state = worst(service.state, declared);
    if (state === service.state) return service;
    return { ...service, state, detail: "Status reported by our operations team." };
  });

  return [...merged, ...extras];
}

function groupServices(services: ServiceHealth[]) {
  const groups = new Map<string, ServiceHealth[]>();
  for (const service of services) {
    const existing = groups.get(service.group);
    if (existing) existing.push(service);
    else groups.set(service.group, [service]);
  }
  return Array.from(groups.entries()).map(([group, items]) => ({ group, services: items }));
}

/** Everything unknown: correct answer when nothing could be measured. */
export function unknownStatus(checkedAt = new Date().toISOString()): SystemStatus {
  const services: ServiceHealth[] = [
    { id: "web", name: "Dashboard & web", description: "Marketing site, dashboard shell, and console pages", group: "Web", core: true },
    { id: "docs", name: "Documentation", description: "Public developer documentation", group: "Web", core: false },
    { id: "public-api", name: "Public API", description: "Agents, permissions, logs, and token endpoints", group: "API", core: true },
    { id: "verification", name: "Verification API", description: "Action verification and policy runtime — /api/verify", group: "API", core: true },
    { id: "auth", name: "Authentication", description: "Login, signup, and session management", group: "API", core: true },
    { id: "approvals", name: "Approval service", description: "Approval requests, grants, and decision delivery", group: "API", core: true },
    { id: "database", name: "Database", description: "Primary data store", group: "Infrastructure", core: true }
  ].map((service) => ({
    ...service,
    state: "unknown" as HealthState,
    detail: "Status checks could not be completed.",
    latencyMs: null
  }));

  return {
    overall: "unknown",
    services,
    groups: groupServices(services),
    activeIncidents: [],
    resolvedIncidents: [],
    incidentsUnavailable: true,
    checkedAt
  };
}
