import type { Policy } from "./types.js";
/**
 * Pluggable policy registry.
 * Adding a policy requires only implementing {@link Policy} and registering it.
 */
export declare class PolicyRegistry {
    private readonly policies;
    register(policy: Policy): this;
    registerAll(policies: readonly Policy[]): this;
    unregister(id: string): boolean;
    get(id: string): Policy | undefined;
    list(): Policy[];
    static empty(): PolicyRegistry;
}
