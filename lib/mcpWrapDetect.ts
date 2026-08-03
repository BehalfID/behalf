/**
 * Lightweight MCP wrap detection shared by the dashboard and API.
 * Mirrors @behalfid/install wrap markers without pulling that package into the app.
 */

export const WRAPPED_MARKER_ENV = "BEHALFID_DOWNSTREAM_COMMAND";

export type McpServerEntryLike = {
  command?: unknown;
  args?: unknown;
  env?: unknown;
  url?: unknown;
  type?: unknown;
};

export function isWrappableServerEntry(entry: McpServerEntryLike): boolean {
  return typeof entry.command === "string" && entry.command.trim().length > 0;
}

export function isAlreadyWrapped(entry: McpServerEntryLike): boolean {
  const env = entry.env;
  if (env && typeof env === "object" && !Array.isArray(env)) {
    const marker = (env as Record<string, unknown>)[WRAPPED_MARKER_ENV];
    if (typeof marker === "string" && marker.length > 0) return true;
  }
  const args = Array.isArray(entry.args) ? entry.args : [];
  return args.some(
    (arg) =>
      typeof arg === "string" &&
      (arg.includes("@behalfid/mcp-runtime") || arg === "behalfid-mcp-runtime")
  );
}

export function getDownstreamCommand(entry: McpServerEntryLike): string | null {
  const env = entry.env;
  if (env && typeof env === "object" && !Array.isArray(env)) {
    const marker = (env as Record<string, unknown>)[WRAPPED_MARKER_ENV];
    if (typeof marker === "string" && marker.length > 0) return marker;
  }
  return null;
}

export type ServerWrapStatus = "wrapped" | "wrappable" | "url-only" | "advisory-behalfid" | "unknown";

export function classifyServerWrapStatus(
  name: string,
  entry: McpServerEntryLike
): ServerWrapStatus {
  if (name === "behalfid" || name === "behalf") return "advisory-behalfid";
  if (isAlreadyWrapped(entry)) return "wrapped";
  if (isWrappableServerEntry(entry)) return "wrappable";
  if (typeof entry.url === "string" && entry.url.trim()) return "url-only";
  return "unknown";
}
