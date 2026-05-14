import type { BehalfIDConfig, CreateAgentInput, CreateAgentResult, CreatePermissionInput, CreatePermissionResult, ExecuteActionInput, ExecuteActionResult, RotateKeyResult, VerificationLog, VerifyInput, VerifyResult } from "./types.js";
export declare class BehalfID {
    private readonly apiKey;
    private readonly developerToken;
    private readonly baseUrl;
    constructor({ apiKey, developerToken, baseUrl, allowInsecureHttp }: BehalfIDConfig);
    verify(input: VerifyInput): Promise<VerifyResult>;
    executeAction(input: ExecuteActionInput): Promise<ExecuteActionResult>;
    createAgent(input: string | CreateAgentInput): Promise<CreateAgentResult>;
    createPermission(input: CreatePermissionInput): Promise<CreatePermissionResult>;
    rotateKey(agentId: string): Promise<RotateKeyResult>;
    getLogs(agentId: string): Promise<VerificationLog[]>;
    private request;
}
