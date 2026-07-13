import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubCliHome } from "./helpers/stubCliHome";

const SESSION_COOKIE = "behalfid_developer=session_secret_value";
const DEVELOPER_TOKEN = "bhf_dev_developer_secret_value";
const AGENT_API_KEY = "bhf_sk_agent_secret_value";

function tempDir(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}

async function loadCli(home: string, baseUrl?: string) {
  vi.resetModules();
  stubCliHome(home);
  vi.stubEnv("BEHALFID_BASE_URL", baseUrl);
  vi.stubEnv("BEHALFID_API_KEY", AGENT_API_KEY);

  const config = await import("../packages/cli/src/lib/config");
  const client = await import("../packages/cli/src/lib/client");
  const permissions = await import("../packages/cli/src/commands/permissions");
  const output = await import("../packages/cli/src/lib/output");
  output.setJsonMode(false);
  return { config, client, permissions };
}

function requestHeaders(init?: RequestInit) {
  return new Headers(init?.headers);
}

async function flushAction() {
  await new Promise((resolve) => setImmediate(resolve));
}

function capturedOutput(...spies: Array<{ mock: { calls: unknown[][] } }>) {
  return JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CLI production base URL", () => {
  it("resolves and requests the canonical production origin directly", async () => {
    const { client } = await loadCli(tempDir("behalf-cli-client-"));
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("https://www.behalfid.com/api/health");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(client.DEFAULT_BASE_URL).toBe("https://www.behalfid.com");
    expect(client.resolveBaseUrl()).toBe("https://www.behalfid.com");
    await client.apiRequest("/api/health", { skipAuth: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("CLI permission human authentication", () => {
  it("create sends the saved login session without agent-key auth", async () => {
    const { config, permissions } = await loadCli(tempDir("behalf-cli-permissions-"));
    config.writeSession(SESSION_COOKIE);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const headers = requestHeaders(init);
      expect(String(input)).toBe("https://www.behalfid.com/api/permissions");
      expect(headers.get("cookie")).toBe(SESSION_COOKIE);
      expect(headers.get("authorization")).toBeNull();
      expect(headers.get("x-developer-token")).toBeNull();
      expect(headers.get("origin")).toBe("https://www.behalfid.com");
      return new Response(JSON.stringify({ permissionId: "perm_test", status: "active" }), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await permissions.permissionsCommand().parseAsync([
      "node", "permissions", "create", "agent_test",
      "--action", "execute_command", "--resource", "shell"
    ]);
    await flushAction();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    const output = capturedOutput(logSpy, errorSpy);
    expect(output).not.toContain(SESSION_COOKIE);
    expect(output).not.toContain(AGENT_API_KEY);
  });

  it("revoke sends the saved login session to an explicit local base URL", async () => {
    const { config, permissions } = await loadCli(
      tempDir("behalf-cli-permissions-"),
      "http://127.0.0.1:3000/"
    );
    config.writeSession(SESSION_COOKIE);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const headers = requestHeaders(init);
      expect(String(input)).toBe("http://127.0.0.1:3000/api/permissions/perm_test/revoke");
      expect(headers.get("cookie")).toBe(SESSION_COOKIE);
      expect(headers.get("authorization")).toBeNull();
      expect(headers.get("origin")).toBe("http://127.0.0.1:3000");
      return new Response(JSON.stringify({ revoked: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await permissions.permissionsCommand().parseAsync([
      "node", "permissions", "revoke", "perm_test"
    ]);
    await flushAction();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    const output = capturedOutput(logSpy, errorSpy);
    expect(output).not.toContain(SESSION_COOKIE);
    expect(output).not.toContain(AGENT_API_KEY);
  });

  it.each(["create", "revoke"] as const)(
    "%s sends an explicit developer token without session or agent-key auth",
    async (operation) => {
      const { config, permissions } = await loadCli(tempDir("behalf-cli-permissions-"));
      config.writeConfig({ baseUrl: "https://cli.example.test", apiKey: AGENT_API_KEY });
      config.writeSession(SESSION_COOKIE);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const headers = requestHeaders(init);
        const path = operation === "create" ? "/api/permissions" : "/api/permissions/perm_test/revoke";
        expect(String(input)).toBe(`https://cli.example.test${path}`);
        expect(headers.get("x-developer-token")).toBe(DEVELOPER_TOKEN);
        expect(headers.get("cookie")).toBeNull();
        expect(headers.get("authorization")).toBeNull();
        const result = operation === "create"
          ? { permissionId: "perm_test", status: "active" }
          : { revoked: true };
        return new Response(JSON.stringify(result), { status: operation === "create" ? 201 : 200 });
      });
      vi.stubGlobal("fetch", fetchMock);

      const args = operation === "create"
        ? ["node", "permissions", "create", "agent_test", "--action", "execute_command"]
        : ["node", "permissions", "revoke", "perm_test"];
      await permissions.permissionsCommand().parseAsync([
        ...args, "--developer-token", DEVELOPER_TOKEN
      ]);
      await flushAction();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
      const output = capturedOutput(logSpy, errorSpy);
      expect(output).not.toContain(DEVELOPER_TOKEN);
      expect(output).not.toContain(SESSION_COOKIE);
      expect(output).not.toContain(AGENT_API_KEY);
    }
  );

  it("does not treat a configured agent API key as human authorization", async () => {
    const { permissions } = await loadCli(tempDir("behalf-cli-permissions-"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    await permissions.permissionsCommand().parseAsync([
      "node", "permissions", "create", "agent_test", "--action", "execute_command"
    ]);
    await flushAction();

    expect(fetchMock).not.toHaveBeenCalled();
    const output = capturedOutput(errorSpy);
    expect(output).toMatch(/human authentication/i);
    expect(output).not.toContain(AGENT_API_KEY);
  });
});
