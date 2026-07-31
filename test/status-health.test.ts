import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  deriveOverallStatus,
  getSystemStatus,
  unknownStatus,
  type ServiceHealth
} from "@/lib/statusHealth";

const dbMocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  isPostgresRuntimeEnabled: vi.fn(() => false),
  isPostgresConfigured: vi.fn(() => false),
  findBySessionId: vi.fn(),
  findOnePermission: vi.fn(),
  findOneApproval: vi.fn(),
  listComponents: vi.fn(),
  listIncidents: vi.fn(),
  ping: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  connectToDatabase: dbMocks.connectToDatabase
}));

vi.mock("@/lib/db/postgres", () => ({
  isPostgresConfigured: dbMocks.isPostgresConfigured,
  getPostgresDb: vi.fn()
}));

vi.mock("@/lib/repositories/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repositories/backend")>();
  return {
    ...actual,
    isPostgresRuntimeEnabled: dbMocks.isPostgresRuntimeEnabled
  };
});

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
}));

vi.mock("mongoose", () => ({
  default: {
    connection: {
      get db() {
        return { admin: () => ({ ping: dbMocks.ping }) };
      }
    }
  }
}));

vi.mock("@/lib/repositories/sessions", () => ({
  findBySessionId: dbMocks.findBySessionId
}));

vi.mock("@/lib/repositories/permissions", () => ({
  findOnePermission: dbMocks.findOnePermission
}));

vi.mock("@/lib/repositories/approvals", () => ({
  findOneApproval: dbMocks.findOneApproval
}));

vi.mock("@/lib/repositories/status", () => ({
  listComponents: dbMocks.listComponents,
  listIncidents: dbMocks.listIncidents
}));

function service(
  id: string,
  state: ServiceHealth["state"],
  core = true
): ServiceHealth {
  return {
    id,
    name: id,
    description: id,
    group: "API",
    state,
    detail: "test",
    core,
    latencyMs: null
  };
}

describe("deriveOverallStatus", () => {
  it("returns unknown when every core service is unknown", () => {
    const services = [
      service("web", "unknown"),
      service("public-api", "unknown"),
      service("database", "unknown")
    ];
    expect(deriveOverallStatus(services)).toBe("unknown");
  });

  it("returns major_outage when all core services are down", () => {
    const services = [
      service("web", "major_outage"),
      service("public-api", "major_outage"),
      service("database", "major_outage")
    ];
    expect(deriveOverallStatus(services)).toBe("major_outage");
  });

  it("returns partial_outage when some core services are down", () => {
    const services = [
      service("web", "operational"),
      service("public-api", "major_outage"),
      service("database", "operational")
    ];
    expect(deriveOverallStatus(services)).toBe("partial_outage");
  });

  it("returns degraded when a core service is slow but reachable", () => {
    const services = [
      service("web", "operational"),
      service("public-api", "degraded"),
      service("database", "operational")
    ];
    expect(deriveOverallStatus(services)).toBe("degraded");
  });

  it("returns partial_outage when a non-core add-on is down", () => {
    const services = [
      service("web", "operational"),
      service("public-api", "operational"),
      service("docs", "major_outage", false)
    ];
    expect(deriveOverallStatus(services)).toBe("partial_outage");
  });
});

describe("unknownStatus", () => {
  it("never throws and marks every service unknown", () => {
    const payload = unknownStatus("2026-01-01T00:00:00.000Z");
    expect(payload.overall).toBe("unknown");
    expect(payload.services.every((entry) => entry.state === "unknown")).toBe(true);
    expect(payload.incidentsUnavailable).toBe(true);
  });
});

describe("getSystemStatus", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    dbMocks.isPostgresRuntimeEnabled.mockReturnValue(false);
    dbMocks.isPostgresConfigured.mockReturnValue(false);
    dbMocks.connectToDatabase.mockResolvedValue(undefined);
    dbMocks.ping.mockResolvedValue({ ok: 1 });
    dbMocks.findBySessionId.mockResolvedValue({ sessionId: "probe" });
    dbMocks.findOnePermission.mockResolvedValue({ permissionId: "probe" });
    dbMocks.findOneApproval.mockResolvedValue({ approvalId: "probe" });
    dbMocks.listComponents.mockResolvedValue([]);
    dbMocks.listIncidents.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns unknown when MONGODB_URI is missing", async () => {
    delete process.env.MONGODB_URI;
    process.env.NEXT_PUBLIC_APP_URL = "https://behalfid.com";

    const payload = await getSystemStatus();
    expect(payload.overall).not.toBe("operational");
    expect(payload.services.find((entry) => entry.id === "database")?.state).toBe("unknown");
    expect(dbMocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it("reports database down without rejecting the aggregate", async () => {
    process.env.MONGODB_URI = "mongodb://example.test/behalf";
    process.env.NEXT_PUBLIC_APP_URL = "https://behalfid.com";
    dbMocks.connectToDatabase.mockRejectedValue(new Error("connection refused"));

    const payload = await getSystemStatus();
    expect(payload.services.find((entry) => entry.id === "database")?.state).toBe("major_outage");
    expect(payload.services.find((entry) => entry.id === "auth")?.state).toBe("major_outage");
    expect(payload.overall).toBe("partial_outage");
  });

  it("never puts driver messages in the public payload", async () => {
    process.env.MONGODB_URI = "mongodb://example.test/behalf";
    process.env.NEXT_PUBLIC_APP_URL = "https://behalfid.com";
    dbMocks.connectToDatabase.mockRejectedValue(new Error("secret-hostname.internal:27017 timeout"));

    const payload = await getSystemStatus();
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("secret-hostname");
    expect(serialized).not.toContain("connection refused");
    expect(serialized).not.toContain("27017");
  });
});
