import http from "node:http";
import net from "node:net";
import type { Duplex } from "node:stream";
import { requestEgressAuthorization, type AuthorizeClientOptions } from "./authorizeClient.js";
import {
  parseHostPort,
  type EgressAuthorizeResponse,
  type EgressMode,
  type ParsedProxyTarget
} from "./types.js";

export type EgressProxyServerOptions = {
  mode: Exclude<EgressMode, "off">;
  authorize: AuthorizeClientOptions;
  /** Inject authorize fn for tests. */
  authorizeFn?: (
    req: Parameters<typeof requestEgressAuthorization>[1]
  ) => Promise<EgressAuthorizeResponse>;
  onDecision?: (info: {
    target: ParsedProxyTarget;
    decision: EgressAuthorizeResponse;
    forwarded: boolean;
  }) => void;
};

function sanitizePlainText(message: string, maxLength = 200): string {
  return message.replace(/[^\t !-~]/g, "?").slice(0, maxLength);
}

function writeHttpError(
  socket: Duplex | net.Socket | http.ServerResponse,
  status: number,
  message: string
) {
  const safeMessage = sanitizePlainText(message);
  const statusText = http.STATUS_CODES[status] ?? "Error";
  if ("writeHead" in socket) {
    socket.writeHead(status, {
      "Content-Type": "text/plain",
      "Content-Length": Buffer.byteLength(safeMessage),
      Connection: "close"
    });
    socket.end(safeMessage);
    return;
  }
  const body = `HTTP/1.1 ${status} ${statusText}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(safeMessage)}\r\n\r\n${safeMessage}`;
  socket.end(body);
}

async function decide(
  options: EgressProxyServerOptions,
  target: ParsedProxyTarget
): Promise<{ decision: EgressAuthorizeResponse; forwarded: boolean }> {
  const authorizeFn =
    options.authorizeFn ??
    ((req) => requestEgressAuthorization(options.authorize, req));

  const decision = await authorizeFn({
    method: target.method,
    url: target.url,
    host: target.host,
    port: target.port,
    protocol: target.protocol
  });

  const forwarded = decision.allowed || options.mode === "advise";
  options.onDecision?.({ target, decision, forwarded });
  return { decision, forwarded };
}

/**
 * Lightweight loopback HTTP/CONNECT proxy.
 * Allowed CONNECT requests use raw TCP tunnel (no MITM / no local CA).
 */
export function createEgressProxyServer(options: EgressProxyServerOptions): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      const method = (req.method ?? "GET").toUpperCase();
      if (!req.url) {
        writeHttpError(res, 400, "Bad Request");
        return;
      }

      let target: ParsedProxyTarget;
      let requestPath: string;
      if (req.url.startsWith("http://") || req.url.startsWith("https://")) {
        const absolute = new URL(req.url);
        requestPath = absolute.pathname + absolute.search;
        target = {
          host: absolute.hostname,
          port: absolute.port
            ? Number(absolute.port)
            : absolute.protocol === "https:"
              ? 443
              : 80,
          method,
          url: absolute.toString(),
          protocol: absolute.protocol === "https:" ? "https" : "http"
        };
      } else {
        const hostHeader = req.headers.host;
        if (!hostHeader) {
          writeHttpError(res, 400, "Missing Host header");
          return;
        }
        const { host, port } = parseHostPort(hostHeader, 80);
        requestPath = req.url;
        target = {
          host,
          port,
          method,
          url: `http://${host}:${port}${req.url}`,
          protocol: "http"
        };
      }

      const { decision, forwarded } = await decide(options, target);
      if (!forwarded) {
        writeHttpError(res, 403, decision.reason || "Forbidden by BehalfID egress policy");
        return;
      }

      const upstream = http.request(
        {
          hostname: target.host,
          port: target.port,
          path: requestPath,
          method,
          headers: {
            ...req.headers,
            host: `${target.host}:${target.port}`,
            "proxy-authorization": undefined,
            "proxy-connection": undefined
          }
        },
        (upstreamRes) => {
          res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
          upstreamRes.pipe(res);
        }
      );
      upstream.on("error", () => {
        if (!res.headersSent) writeHttpError(res, 502, "Upstream error");
        else res.end();
      });
      req.pipe(upstream);
    } catch (error) {
      writeHttpError(res, 400, error instanceof Error ? error.message : "Bad Request");
    }
  });

  server.on("connect", async (req, clientSocket, head) => {
    try {
      const authority = req.url ?? "";
      const { host, port } = parseHostPort(authority, 443);
      const target: ParsedProxyTarget = {
        host,
        port,
        method: "CONNECT",
        url: `https://${host}:${port}/`,
        protocol: "connect"
      };

      const { decision, forwarded } = await decide(options, target);
      if (!forwarded) {
        writeHttpError(clientSocket, 403, decision.reason || "Forbidden by BehalfID egress policy");
        clientSocket.destroy();
        return;
      }

      const upstream = net.connect(port, host, () => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });

      upstream.on("error", () => {
        writeHttpError(clientSocket, 502, "Upstream connect failed");
        clientSocket.destroy();
      });
      clientSocket.on("error", () => upstream.destroy());
    } catch (error) {
      writeHttpError(
        clientSocket,
        400,
        error instanceof Error ? error.message : "Bad CONNECT request"
      );
      clientSocket.destroy();
    }
  });

  return server;
}

export async function listenLoopback(
  server: http.Server,
  preferredPort = 0
): Promise<{ port: number; host: string }> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(preferredPort, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind egress proxy.");
  }
  return { port: address.port, host: "127.0.0.1" };
}
