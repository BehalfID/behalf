import type { AuditRule } from "./types.js";
/**
 * Registry for pluggable {@link AuditRule} instances.
 *
 * Adding a new rule requires only implementing `AuditRule` and calling
 * {@link register} — the audit engine does not need to change.
 */
export declare class RuleRegistry {
    private readonly rules;
    /** Register a rule. Throws if a rule with the same id is already present. */
    register(rule: AuditRule): this;
    /** Register many rules. */
    registerAll(rules: readonly AuditRule[]): this;
    /** Return a snapshot of registered rules in registration order. */
    list(): AuditRule[];
    /** Look up a rule by id. */
    get(id: string): AuditRule | undefined;
    /** Number of registered rules. */
    get size(): number;
    /** Create an empty registry. */
    static empty(): RuleRegistry;
}
