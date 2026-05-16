#!/usr/bin/env node
// BehalfID — Secure Ollama Proxy
//
// Sits between Vercel (or any external caller) and a local Ollama instance.
// Requires a bearer token. Only allows GET /api/tags and POST /api/chat.
// Expose publicly via Cloudflare Tunnel — NOT by opening port 11434.
//
// Usage:
//   OLLAMA_PROXY_TOKEN=<token> npm run ollama:proxy
//   OLLAMA_PROXY_TOKEN=$(openssl rand -hex 32) npm run ollama:proxy

"use strict";

const http   = require("http");
const crypto = require("crypto");
const fs     = require("fs");
const path   = require("path");

// ── Load env files (no external deps) ────────────────────────────────────────

function parseEnvFile(filename) {
  const filePath = path.join(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return {};
  const vars = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const raw = trimmed.slice(eqIdx + 1).trim();
    vars[key] = raw.replace(/^["']|["']$/g, "");
  }
  return vars;
}

const env = { ...parseEnvFile(".env"), ...parseEnvFile(".env.local"), ...process.env };

// ── Config ────────────────────────────────────────────────────────────────────

const HOST         = env.OLLAMA_PROXY_HOST         || "127.0.0.1";
const PORT         = parseInt(env.OLLAMA_PROXY_PORT || "8787", 10);
const UPSTREAM_URL = (env.OLLAMA_UPSTREAM_URL       || "http://127.0.0.1:11434").replace(/\/$/, "");
const PROXY_TOKEN  = env.OLLAMA_PROXY_TOKEN         || "";
const TIMEOUT_MS   = parseInt(env.OLLAMA_PROXY_TIMEOUT_MS || env.OLLAMA_TIMEOUT_MS || "30000", 10);
const MAX_BODY     = parseInt(env.OLLAMA_PROXY_MAX_BODY_BYTES   || "1048576", 10);

// ── Logging ───────────────────────────────────────────────────────────────────

function log(level, msg) {
  process.stdout.write(`[${new Date().toISOString()}] [${level.padEnd(5)}] ${msg}\n`);
}

// ── Token comparison (constant-time) ─────────────────────────────────────────

function tokenValid(provided) {
  if (!PROXY_TOKEN || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(PROXY_TOKEN);
  // timingSafeEqual requires equal-length buffers
  if (a.length !== b.length) {
    // Perform a dummy comparison to avoid length-based timing leak
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

// ── Request body reader with size cap ────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY) {
        req.destroy(new Error("TOO_LARGE"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end",   () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ── JSON response helper ──────────────────────────────────────────────────────

function jsonRes(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type":   "application/json",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

// ── Allowlisted routes ────────────────────────────────────────────────────────

const ALLOWED = new Set(["GET /api/tags", "POST /api/chat"]);

// ── Request handler ───────────────────────────────────────────────────────────

async function handle(req, res) {
  const urlPath  = (req.url || "/").split("?")[0];
  const routeKey = `${req.method} ${urlPath}`;

  // 1. Bearer token authentication
  const authHeader = req.headers["authorization"] || "";
  const provided   = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!tokenValid(provided)) {
    log("WARN", `Auth failure  ${req.method} ${urlPath}`);
    return jsonRes(res, 401, {
      error:   "Unauthorized.",
      details: "Provide a valid Authorization: Bearer <token> header."
    });
  }

  // 2. Route allowlist — reject anything not explicitly permitted
  if (!ALLOWED.has(routeKey)) {
    log("WARN", `Rejected route  ${req.method} ${urlPath}`);
    return jsonRes(res, 404, {
      error:   "Not found.",
      details: "This proxy only allows GET /api/tags and POST /api/chat."
    });
  }

  // 3. Forward to upstream Ollama
  const upstreamUrl = `${UPSTREAM_URL}${urlPath}`;
  const controller  = new AbortController();
  const timer       = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let upstreamRes;

    if (req.method === "POST") {
      // Read + size-check body before forwarding
      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        clearTimeout(timer);
        if (err && err.message === "TOO_LARGE") {
          log("WARN", `Body too large  ${urlPath}`);
          return jsonRes(res, 413, {
            error:   "Request body too large.",
            details: `Maximum body size is ${MAX_BODY} bytes.`
          });
        }
        throw err;
      }

      upstreamRes = await fetch(upstreamUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal:  controller.signal
      });
    } else {
      upstreamRes = await fetch(upstreamUrl, {
        method: "GET",
        signal: controller.signal
      });
    }

    clearTimeout(timer);

    const upstreamBody  = await upstreamRes.text();
    const upstreamCT    = upstreamRes.headers.get("content-type") || "application/json";

    const safeUrlPath = urlPath.replace(/[\r\n\t\x00-\x1f\x7f]/g, "");
    log("INFO", `${req.method} ${safeUrlPath} → ${upstreamRes.status}`);

    res.writeHead(upstreamRes.status, { "Content-Type": upstreamCT });
    res.end(upstreamBody);

  } catch (err) {
    clearTimeout(timer);
    const safeUrlPath = urlPath.replace(/[\r\n\t\x00-\x1f\x7f]/g, "");
    const isTimeout = err && err.name === "AbortError";
    if (isTimeout) {
      log("ERROR", `Upstream timeout  ${safeUrlPath}`);
      return jsonRes(res, 504, {
        error:   "Upstream timeout.",
        details: `Ollama did not respond within ${TIMEOUT_MS / 1000}s.`
      });
    }
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", `Upstream error  ${safeUrlPath}  ${msg}`);
    return jsonRes(res, 502, {
      error:   "Upstream error.",
      details: "Could not reach Ollama. Make sure it is running (ollama serve)."
    });
  }
}

// ── Startup checks ────────────────────────────────────────────────────────────

function startup() {
  if (!PROXY_TOKEN) {
    log("ERROR", "OLLAMA_PROXY_TOKEN is not set. Refusing to start without a token.");
    log("ERROR", "Generate one with: openssl rand -hex 32");
    log("ERROR", "Add it to .env.local or export it before running npm run ollama:proxy.");
    process.exit(1);
  }

  if (HOST === "0.0.0.0") {
    log("WARN", "OLLAMA_PROXY_HOST=0.0.0.0 — listening on all interfaces.");
    log("WARN", "Make sure only authorised sources can reach this port.");
    log("WARN", "Use Cloudflare Tunnel instead of binding to 0.0.0.0 where possible.");
  }

  const upstreamIsRemote = !/localhost|127\.0\.0\.1/.test(UPSTREAM_URL);
  if (upstreamIsRemote) {
    log("WARN", `OLLAMA_UPSTREAM_URL=${UPSTREAM_URL} — this is a remote Ollama.`);
    log("WARN", "Make sure the upstream Ollama is secured and not publicly exposed.");
  }
}

// ── Server ────────────────────────────────────────────────────────────────────

startup();

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    log("ERROR", `Unhandled: ${err instanceof Error ? err.message : String(err)}`);
    if (!res.headersSent) {
      jsonRes(res, 500, { error: "Internal proxy error." });
    }
  });
});

server.listen(PORT, HOST, () => {
  log("INFO", `Ollama secure proxy ready  http://${HOST}:${PORT}`);
  log("INFO", `Upstream: ${UPSTREAM_URL}`);
  log("INFO", `Token: ${PROXY_TOKEN ? "set" : "NOT SET"}`);
  log("INFO", `Allowed: GET /api/tags  POST /api/chat`);
  log("INFO", `Limits: body=${MAX_BODY}B  timeout=${TIMEOUT_MS}ms`);
});

server.on("error", (err) => {
  log("ERROR", `Server: ${err.message}`);
  process.exit(1);
});
