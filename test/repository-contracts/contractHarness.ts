import { beforeEach, describe } from "vitest";

/**
 * Registers a repository contract suite. Each implementation supplies a factory
 * that returns the repository methods plus seed helpers for that backing store.
 */
export function repositoryContractSuite<TDeps>(
  name: string,
  factory: () => TDeps | Promise<TDeps>,
  register: (getDeps: () => TDeps) => void
) {
  describe(`repository contract: ${name}`, () => {
    let deps!: TDeps;

    beforeEach(async () => {
      deps = await factory();
    });

    register(() => deps);
  });
}
