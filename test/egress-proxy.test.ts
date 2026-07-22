import http from "node:http";
import net from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEgressProxyServer,
  listenLoopback
} from "../packages/egress-proxy/src/server";
import {
  hostInList,
  hostMatchesPattern,
  parseHostPort
} from "../packages/egress-proxy/src/types";
import {
  buildEgressChildEnv,
  parseEgressMode
} from "../packages/cli/src/lib/egressLaunch";
import {
  authorizeEgressRequest,
  hostMatchesPattern as platformHostMatches,
  isBlockedEgressHost,
  mintEgressTicket,
  verifyEgressTicket
} from "@/lib/egressAuthorize";

describe("egress proxy helpers", () => {
  it("parses host:port authorities including IPv6", () => {
    expect(parseHostPort("example.com:443", 80)).toEqual({ host: "example.com", port: 443 });
    expect(parseHostPort("[::1]:8443", 443)).toEqual({ host: "::1", port: 8443 });
  });

  it("matches allow/deny host patterns", () => {
    expect(hostMatchesPattern("api.stripe.com", "*.stripe.com")).toBe(true);
    expect(hostMatchesPattern("evil.com", "*.stripe.com")).toBe(false);
    expect(hostInList("api.github.com", ["*.github.com", "npmjs.org"])).toBe(true);
  });
});

describe("CLI egress env injection", () => {
  it("injects HTTP(S)_PROXY and preserves NO_PROXY for platform + loopback", () => {
    const env = buildEgressChildEnv({
      mode: "enforce",
      proxyHost: "127.0.0.1",
      proxyPort: 18080,
      baseUrl: "https://behalfid.com",
      parentEnv: { PATH: "/usr/bin", NO_PROXY: "internal.test" },
      allowHosts: ["registry.npmjs.org"]
    });

    expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:18080");
    expect(env.HTTP_PROXY).toBe("http://127.0.0.1:18080");
    expect(env.BEHALFID_EGRESS_MODE).toBe("enforce");
    expect(env.NO_PROXY?.split(",")).toEqual(
      expect.arrayContaining([
        "127.0.0.1",
        "localhost",
        "behalfid.com",
        "internal.test",
        "registry.npmjs.org"
      ])
    );
  });

  it("leaves env unchanged when mode is off", () => {
    const parent = { FOO: "bar" };
    expect(buildEgressChildEnv({
      mode: "off",
      proxyHost: "127.0.0.1",
      proxyPort: 1,
      baseUrl: "https://behalfid.com",
      parentEnv: parent
    })).toEqual(parent);
  });

  it("parses egress modes", () => {
    expect(parseEgressMode("advise")).toBe("advise");
    expect(parseEgressMode("enforce")).toBe("enforce");
    expect(parseEgressMode("nope")).toBe("off");
  });
});

describe("egress authorize policy", () => {
  it("blocks metadata and private hosts", () => {
    expect(isBlockedEgressHost("169.254.169.254").blocked).toBe(true);
    expect(isBlockedEgressHost("metadata.google.internal").blocked).toBe(true);
    expect(isBlockedEgressHost("127.0.0.1").blocked).toBe(true);
    expect(platformHostMatches("api.stripe.com", "*.stripe.com")).toBe(true);
  });

  it("mints and verifies short-lived egress tickets", () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const ticket = mintEgressTicket({
      agentId: "agent_1",
      host: "api.stripe.com",
      port: 443,
      expiresAt
    });
    expect(
      verifyEgressTicket(ticket, { agentId: "agent_1", host: "api.stripe.com", port: 443 })
    ).toBe(true);
    expect(
      verifyEgressTicket(ticket, { agentId: "agent_2", host: "api.stripe.com", port: 443 })
    ).toBe(false);
  });

  it("allows platform hosts without calling verify", async () => {
    const decision = await authorizeEgressRequest({
      request: {
        agentId: "agent_1",
        method: "CONNECT",
        url: "https://behalfid.com:443/",
        host: "behalfid.com",
        port: 443,
        protocol: "connect"
      },
      accountId: "acct_1"
    });
    expect(decision.allowed).toBe(true);
    expect(decision.ticket).toMatch(/^bhf_egress_/);
  });
});

describe("egress proxy CONNECT tunneling", () => {
  const servers: Array<http.Server | net.Server> = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          })
      )
    );
  });

  it("allows CONNECT when authorize permits and tunnels bytes", async () => {
    const upstream = net.createServer((socket) => {
      socket.on("data", (chunk) => {
        socket.write(`echo:${chunk.toString("utf8")}`);
      });
    });
    servers.push(upstream);
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", () => resolve()));
    const upstreamPort = (upstream.address() as net.AddressInfo).port;

    const proxy = createEgressProxyServer({
      mode: "enforce",
      authorize: {
        baseUrl: "http://example.invalid",
        apiKey: "bhf_sk_test",
        agentId: "agent_1"
      },
      authorizeFn: async () => ({ allowed: true, reason: "ok" })
    });
    servers.push(proxy);
    const { port } = await listenLoopback(proxy);

    const tunneled = await new Promise<string>((resolve, reject) => {
      const req = http.request({
        host: "127.0.0.1",
        port,
        method: "CONNECT",
        path: `127.0.0.1:${upstreamPort}`
      });
      req.on("connect", (_res, socket) => {
        socket.write("hello");
        socket.once("data", (chunk) => {
          resolve(chunk.toString("utf8"));
          socket.end();
        });
      });
      req.on("error", reject);
      req.end();
    });

    expect(tunneled).toBe("echo:hello");
  });

  it("blocks CONNECT in enforce mode when authorize denies", async () => {
    const proxy = createEgressProxyServer({
      mode: "enforce",
      authorize: {
        baseUrl: "http://example.invalid",
        apiKey: "bhf_sk_test",
        agentId: "agent_1"
      },
      authorizeFn: async () => ({ allowed: false, reason: "blocked host" })
    });
    servers.push(proxy);
    const { port } = await listenLoopback(proxy);

    const status = await new Promise<number>((resolve, reject) => {
      const socket = net.connect(port, "127.0.0.1", () => {
        socket.write("CONNECT evil.example:443 HTTP/1.1\r\nHost: evil.example:443\r\n\r\n");
      });
      socket.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        const match = /^HTTP\/1\.[01] (\d+)/.exec(text);
        resolve(match ? Number(match[1]) : 0);
        socket.end();
      });
      socket.on("error", reject);
    });

    expect(status).toBe(403);
  });

  it("forwards denied CONNECT in advise mode", async () => {
    const upstream = net.createServer((socket) => socket.end());
    servers.push(upstream);
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", () => resolve()));
    const upstreamPort = (upstream.address() as net.AddressInfo).port;

    const decisions: Array<{ forwarded: boolean }> = [];
    const proxy = createEgressProxyServer({
      mode: "advise",
      authorize: {
        baseUrl: "http://example.invalid",
        apiKey: "bhf_sk_test",
        agentId: "agent_1"
      },
      authorizeFn: async () => ({ allowed: false, reason: "would block" }),
      onDecision: (info) => decisions.push({ forwarded: info.forwarded })
    });
    servers.push(proxy);
    const { port } = await listenLoopback(proxy);

    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request({
        host: "127.0.0.1",
        port,
        method: "CONNECT",
        path: `127.0.0.1:${upstreamPort}`
      });
      req.on("connect", (res) => {
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end();
    });

    expect(status).toBe(200);
    expect(decisions[0]?.forwarded).toBe(true);
  });
});

describe("authorizeEgressRequest with verify", () => {
  it("denies when verifyAction denies http_request", async () => {
    vi.resetModules();
    vi.doMock("@/lib/verify", () => ({
      verifyAction: vi.fn().mockResolvedValue({
        requestId: "req_1",
        allowed: false,
        reason: "No active permission exists for this action.",
        risk: "high",
        approvalId: null
      })
    }));

    const { authorizeEgressRequest: authorize } = await import("@/lib/egressAuthorize");
    const decision = await authorize({
      request: {
        agentId: "agent_1",
        method: "CONNECT",
        url: "https://api.example.com:443/",
        host: "api.example.com",
        port: 443,
        protocol: "connect"
      },
      accountId: "acct_1",
      agentStatus: "active"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/permission/i);
    vi.doUnmock("@/lib/verify");
    vi.resetModules();
  });
});
