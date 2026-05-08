import type { BehalfIDConfig, CreateAgentInput, CreateAgentResult, CreatePermissionInput, CreatePermissionResult, RotateKeyResult, VerificationLog, VerifyInput, VerifyResult } from "./types.js";
export declare class BehalfID {
    private readonly apiKey;
    private readonly baseUrl;
    constructor({ apiKey, baseUrl, allowInsecureHttp }: BehalfIDConfig);
    verify(input: VerifyInput): Promise<VerifyResult>;
    createAgent(input: string | CreateAgentInput): Promise<CreateAgentResult>;
    createPermission(input: CreatePermissionInput): Promise<CreatePermissionResult>;
    rotateKey(agentId: string): Promise<RotateKeyResult>;
    getLogs(agentId: string): Promise<VerificationLog[]>;
    private request;
}
