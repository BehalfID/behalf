/**
 * Registry for pluggable {@link AuditRule} instances.
 *
 * Adding a new rule requires only implementing `AuditRule` and calling
 * {@link register} — the audit engine does not need to change.
 */
export class RuleRegistry {
    rules = new Map();
    /** Register a rule. Throws if a rule with the same id is already present. */
    register(rule) {
        if (this.rules.has(rule.id)) {
            throw new Error(`Audit rule already registered: ${rule.id}`);
        }
        this.rules.set(rule.id, rule);
        return this;
    }
    /** Register many rules. */
    registerAll(rules) {
        for (const rule of rules) {
            this.register(rule);
        }
        return this;
    }
    /** Return a snapshot of registered rules in registration order. */
    list() {
        return [...this.rules.values()];
    }
    /** Look up a rule by id. */
    get(id) {
        return this.rules.get(id);
    }
    /** Number of registered rules. */
    get size() {
        return this.rules.size;
    }
    /** Create an empty registry. */
    static empty() {
        return new RuleRegistry();
    }
}
