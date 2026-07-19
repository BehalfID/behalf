/**
 * Pluggable policy registry.
 * Adding a policy requires only implementing {@link Policy} and registering it.
 */
export class PolicyRegistry {
    policies = new Map();
    register(policy) {
        if (this.policies.has(policy.id)) {
            throw new Error(`Policy already registered: ${policy.id}`);
        }
        this.policies.set(policy.id, policy);
        return this;
    }
    registerAll(policies) {
        for (const p of policies)
            this.register(p);
        return this;
    }
    unregister(id) {
        return this.policies.delete(id);
    }
    get(id) {
        return this.policies.get(id);
    }
    list() {
        return [...this.policies.values()].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    }
    static empty() {
        return new PolicyRegistry();
    }
}
