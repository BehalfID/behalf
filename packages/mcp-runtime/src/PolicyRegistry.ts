import type { Policy } from "./types.js";

/**
 * Pluggable policy registry.
 * Adding a policy requires only implementing {@link Policy} and registering it.
 */
export class PolicyRegistry {
  private readonly policies = new Map<string, Policy>();

  register(policy: Policy): this {
    if (this.policies.has(policy.id)) {
      throw new Error(`Policy already registered: ${policy.id}`);
    }
    this.policies.set(policy.id, policy);
    return this;
  }

  registerAll(policies: readonly Policy[]): this {
    for (const p of policies) this.register(p);
    return this;
  }

  unregister(id: string): boolean {
    return this.policies.delete(id);
  }

  get(id: string): Policy | undefined {
    return this.policies.get(id);
  }

  list(): Policy[] {
    return [...this.policies.values()].sort(
      (a, b) => (a.priority ?? 100) - (b.priority ?? 100)
    );
  }

  static empty(): PolicyRegistry {
    return new PolicyRegistry();
  }
}
