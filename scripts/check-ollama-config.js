#!/usr/bin/env node
// BehalfID — Ollama connectivity checker
// Usage: node scripts/check-ollama-config.js
//        npm run check:ollama

"use strict";

const fs = require("fs");
const path = require("path");

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
    // Strip optional surrounding quotes
    const raw = trimmed.slice(eqIdx + 1).trim();
    vars[key] = raw.replace(/^["']|["']$/g, "");
  }
  return vars;
}

// .env.local overrides .env; process.env overrides both (already exported vars win)
const envBase = parseEnvFile(".env");
const envLocal = parseEnvFile(".env.local");
const env = { ...envBase, ...envLocal, ...process.env };

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = env.OLLAMA_BASE_URL || "";
const MODEL    = env.OLLAMA_MODEL    || "";

// ── Helpers ───────────────────────────────────────────────────────────────────

const RESET  = "\x1b[0m";
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";

function ok(msg)   { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${RED}✗${RESET} ${msg}`); }
function warn(msg) { console.log(`  ${YELLOW}!${RESET} ${msg}`); }
function info(msg) { console.log(`    ${DIM}${msg}${RESET}`); }
function nl()      { console.log(); }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${BOLD}BehalfID Ollama config check${RESET}\n`);

  // 1. Env vars
  if (BASE_URL) {
    ok(`OLLAMA_BASE_URL: ${BASE_URL}`);
  } else {
    fail("OLLAMA_BASE_URL is not set");
    info("Add it to .env.local: OLLAMA_BASE_URL=http://localhost:11434");
  }

  if (MODEL) {
    ok(`OLLAMA_MODEL:    ${MODEL}`);
  } else {
    fail("OLLAMA_MODEL is not set");
    info("Add it to .env.local: OLLAMA_MODEL=llama3.1:8b");
  }

  nl();

  if (!BASE_URL) {
    printSuggestedFixes();
    process.exit(1);
  }

  // 2. Localhost warning
  const isLocalhost = /localhost|127\.0\.0\.1/.test(BASE_URL);
  if (isLocalhost) {
    warn("OLLAMA_BASE_URL uses localhost.");
    info("This works when npm run dev and Ollama run on the same machine.");
    info("It will NOT work when deployed to Vercel — Vercel cannot reach your Mac's localhost.");
    nl();
  }

  // 3. Reachability check
  const tagsUrl = `${BASE_URL}/api/tags`;
  console.log(`Checking ${tagsUrl} ...`);
  nl();

  let availableModels = [];
  let reachable = false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(tagsUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      reachable = true;
      const data = await res.json().catch(() => null);
      availableModels = (data?.models ?? []).map((m) => m.name);
      ok("Reachable: yes");
    } else {
      fail(`Reachable: no  (HTTP ${res.status})`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    fail(`Reachable: no  (${isTimeout ? "timed out after 8s" : msg})`);
  }

  nl();

  if (!reachable) {
    printSuggestedFixes();
    process.exit(1);
  }

  // 4. Installed models
  if (availableModels.length === 0) {
    warn("No models installed. Pull one with: ollama pull llama3.1:8b");
  } else {
    console.log("Installed models:");
    for (const m of availableModels) {
      info(`- ${m}`);
    }
  }

  nl();

  // 5. Configured model check
  if (!MODEL) {
    warn("OLLAMA_MODEL is not set — skipping model check.");
    nl();
    printResult(false);
    process.exit(1);
  }

  const modelFound = availableModels.some(
    (m) => m === MODEL || m.startsWith(`${MODEL}:`)
  );

  if (modelFound) {
    ok(`Configured model found: yes  (${MODEL})`);
  } else {
    fail(`Configured model not found: ${MODEL}`);
    info(`Run: ollama pull ${MODEL}`);
    if (availableModels.length > 0) {
      info(`Or set OLLAMA_MODEL to one of the installed models above.`);
    }
  }

  nl();
  printResult(modelFound);
  process.exit(modelFound ? 0 : 1);
}

function printResult(success) {
  if (success) {
    console.log(`${GREEN}${BOLD}Result:${RESET}`);
    console.log(`${GREEN}Ollama is ready for local BehalfID drafting.${RESET}`);
    console.log(`\nRestart Next.js if you just changed .env.local: Ctrl+C then npm run dev\n`);
  } else {
    console.log(`${RED}${BOLD}Result:${RESET}`);
    console.log(`${RED}The BehalfID server cannot reach this Ollama URL.${RESET}`);
  }
}

function printSuggestedFixes() {
  console.log(`${YELLOW}${BOLD}Suggested fixes:${RESET}`);
  console.log(`  - If testing locally, use OLLAMA_BASE_URL=http://localhost:11434`);
  console.log(`    and run npm run dev on the same machine as Ollama.`);
  console.log(`  - If Next.js is on another computer on your LAN, use the Mac's LAN IP,`);
  console.log(`    for example http://10.8.9.54:11434 (check with: ifconfig | grep "inet "`);
  console.log(`    on Mac, or ipconfig on Windows).`);
  console.log(`  - If using Vercel, do not use localhost. Use a secure proxy or keep`);
  console.log(`    AI drafting local-only (npm run dev) for now.`);
  console.log(`  - Do not expose raw Ollama publicly without protection.`);
  nl();
}

main().catch((err) => {
  console.error("check-ollama-config error:", err);
  process.exit(1);
});
