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
export type { McpRuntimeOptions } from "./McpRuntime.js";
export { ToolProxy } from "./ToolProxy.js";
export type { ArgumentTransform, ToolProxyOptions } from "./ToolProxy.js";
export { EventBus } from "./EventBus.js";
export { mapInvocationToVerifyRequest } from "./mapInvocation.js";
export { callVerify, isValidVerifyDecision, withVerifyTimeout, VerifyTimeoutError, VerifyMalformedError, } from "./verify.js";
export { createHttpVerifyClient } from "./httpVerifyClient.js";
export type { HttpVerifyClientOptions } from "./httpVerifyClient.js";
export { createVerifyPollingApprovalWaiter } from "./approvalWaiter.js";
export type { VerifyPollingApprovalWaiterOptions } from "./approvalWaiter.js";
export { loadInterceptorConfig, ConfigError } from "./config.js";
export type { InterceptorConfig } from "./config.js";
export { InterceptorServer } from "./stdio/InterceptorServer.js";
export type { InterceptorServerOptions } from "./stdio/InterceptorServer.js";
export { DownstreamMcpClient, encodeToolName, decodeToolName, } from "./stdio/DownstreamClient.js";
export type { DownstreamClientOptions, DownstreamTool, } from "./stdio/DownstreamClient.js";
export type { ApprovalWaiter, ApprovalWaitResult, ExecutionReceipt, McpInvocation, McpTransport, RuntimeEvent, RuntimeEventHandler, RuntimeEventType, RuntimeExecuteResult, RuntimeOutcome, ToolExecutionResult, VerifyClient, VerifyDecision, VerifyRequest, VerifyRisk, } from "./types.js";
