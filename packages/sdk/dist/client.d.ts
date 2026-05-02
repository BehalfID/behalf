import type { BehalfIDConfig, CreateAgentResult, CreatePermissionInput, CreatePermissionResult, RotateKeyResult, VerificationLog, VerifyInput, VerifyResult } from "./types.js";
export declare class BehalfID {
    private readonly apiKey;
    private readonly baseUrl;
    constructor({ apiKey, baseUrl }: BehalfIDConfig);
    verify(input: VerifyInput): Promise<VerifyResult>;
    createAgent(name: string): Promise<CreateAgentResult>;
    createPermission(input: CreatePermissionInput): Promise<CreatePermissionResult>;
    rotateKey(agentId: string): Promise<RotateKeyResult>;
    getLogs(agentId: string): Promise<VerificationLog[]>;
    private request;
}
