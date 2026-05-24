import type { BehalfIDConfig, CreateAgentInput, CreateAgentResult, CreatePermissionInput, CreatePermissionResult, ExecuteActionInput, ExecuteActionResult, RotateKeyResult, VerificationLog, VerifyInput, VerifyResult } from "./types.js";
import { SiteGuardNamespace } from "./site-guard.js";
export declare class BehalfID {
    private readonly apiKey;
    private readonly developerToken;
    private readonly baseUrl;
    /**
     * Site Guard namespace. Use a `bhf_site_...` key as `apiKey` and call
     * `behalf.siteGuard.check({ path, userAgent, agentIdentifier })`.
     *
     * @see https://behalfid.com/docs/site-guard
     */
    readonly siteGuard: SiteGuardNamespace;
    constructor({ apiKey, developerToken, baseUrl, allowInsecureHttp }: BehalfIDConfig);
    verify(input: VerifyInput): Promise<VerifyResult>;
    executeAction(input: ExecuteActionInput): Promise<ExecuteActionResult>;
    createAgent(input: string | CreateAgentInput): Promise<CreateAgentResult>;
    createPermission(input: CreatePermissionInput): Promise<CreatePermissionResult>;
    rotateKey(agentId: string): Promise<RotateKeyResult>;
    getLogs(agentId: string): Promise<VerificationLog[]>;
    private request;
}
