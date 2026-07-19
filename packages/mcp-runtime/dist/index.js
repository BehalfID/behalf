/**
 * @behalfid/mcp-runtime — Policy Enforcement Point for MCP tool invocations.
 *
 * Intercepts every MCP tool call, authorizes via BehalfID verify(), enforces
 * the decision, and proxies to the MCP server only when allowed.
 *
 * Does not implement policy, permissions, approvals, risk, or audit storage —
 * those belong to the BehalfID platform.
 */
export { McpRuntime } from "./McpRuntime.js";
export { ToolProxy } from "./ToolProxy.js";
export { EventBus } from "./EventBus.js";
export { mapInvocationToVerifyRequest } from "./mapInvocation.js";
export { callVerify, isValidVerifyDecision, withVerifyTimeout, VerifyTimeoutError, VerifyMalformedError, } from "./verify.js";
