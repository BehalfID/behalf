import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { generateContextMd, generateMcpJson } from "./context-generator.js";
import type { AgentDetail } from "./passport-cache.js";

export type JsonReadResult =
  | { ok: true; exists: false; data: null }
  | { ok: true; exists: true; data: Record<string, unknown> }
  | { ok: false; exists: true; error: string };

export type ProjectSetupStatus = {
  cwd: string;
  contextFile: string;
  mcpJsonFile: string;
  contextExists: boolean;
  mcpJsonExists: boolean;
  mcpJsonValid: boolean;
  hasBehalfServer: boolean;
  mcpJsonError?: string;
};

export type ProjectSetupResult = ProjectSetupStatus & {
  changed: string[];
  preserved: string[];
  warnings: string[];
};

export function readJsonFile(path: string): JsonReadResult {
  if (!existsSync(path)) return { ok: true, exists: false, data: null };
  try {
    return { ok: true, exists: true, data: JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown> };
  } catch (err) {
    return {
      ok: false,
      exists: true,
      error: err instanceof Error ? err.message : "Invalid JSON",
    };
  }
}

export function hasBehalfMcpServer(data: Record<string, unknown> | null): boolean {
  return !!(data?.mcpServers as Record<string, unknown> | undefined)?.behalfid;
}

export function getProjectSetupStatus(cwd = process.cwd()): ProjectSetupStatus {
  const contextFile = join(cwd, ".behalf", "context.md");
  const mcpJsonFile = join(cwd, ".mcp.json");
  const mcpJson = readJsonFile(mcpJsonFile);

  return {
    cwd,
    contextFile,
    mcpJsonFile,
    contextExists: existsSync(contextFile),
    mcpJsonExists: mcpJson.exists,
    mcpJsonValid: mcpJson.ok,
    hasBehalfServer: mcpJson.ok ? hasBehalfMcpServer(mcpJson.data) : false,
    mcpJsonError: mcpJson.ok ? undefined : mcpJson.error,
  };
}

export function writeProjectSetup(
  detail: AgentDetail,
  options: { cwd?: string; dryRun?: boolean } = {}
): ProjectSetupResult {
  const cwd = options.cwd ?? process.cwd();
  const behalfDir = join(cwd, ".behalf");
  const status = getProjectSetupStatus(cwd);
  const changed: string[] = [];
  const preserved: string[] = [];
  const warnings: string[] = [];

  const existingMcp = readJsonFile(status.mcpJsonFile);
  if (!existingMcp.ok) {
    throw new Error(
      `.mcp.json exists but is not valid JSON. Fix it or move it before running BehalfID MCP init. ${existingMcp.error}`
    );
  }

  const contextMd = generateContextMd(detail);
  const nextMcpJson = generateMcpJson(existingMcp.data ?? undefined);

  changed.push(resolve(status.contextFile));

  if (existingMcp.exists) {
    preserved.push(resolve(status.mcpJsonFile));
    changed.push(resolve(status.mcpJsonFile));
  } else {
    changed.push(resolve(status.mcpJsonFile));
  }

  if (!options.dryRun) {
    if (!existsSync(behalfDir)) mkdirSync(behalfDir, { recursive: true });
    writeFileSync(status.contextFile, contextMd);
    writeFileSync(status.mcpJsonFile, nextMcpJson);
  }

  return {
    ...getProjectSetupStatus(cwd),
    changed,
    preserved,
    warnings,
  };
}
