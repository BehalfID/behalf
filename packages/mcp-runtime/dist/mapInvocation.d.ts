import type { McpInvocation, VerifyRequest } from "./types.js";
/**
 * Single adapter: McpInvocation → BehalfID VerifyRequest.
 * Performs mapping only — no authorization decisions.
 */
export declare function mapInvocationToVerifyRequest(invocation: McpInvocation, defaultAgentId?: string): VerifyRequest;
