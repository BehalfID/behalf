/**
 * Environment / process config for the stdio MCP interceptor.
 */
export type InterceptorConfig = {
    apiKey: string;
    agentId: string;
    baseUrl: string;
    verifyUrl: string;
    verifyTimeoutMs: number;
    provider: string;
    downstream?: {
        serverName: string;
        command: string;
        args: string[];
        env?: Record<string, string>;
    };
};
export declare class ConfigError extends Error {
    constructor(message: string);
}
/**
 * Load interceptor config from process.env.
 * Throws {@link ConfigError} when required auth env is missing.
 */
export declare function loadInterceptorConfig(env?: NodeJS.ProcessEnv): InterceptorConfig;
