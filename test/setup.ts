import { afterEach, vi } from "vitest";

// Next's compiler replaces this marker to enforce React Server Component
// boundaries. Vitest runs modules directly under Node, where the package's
// default export intentionally throws because that compiler condition is absent.
vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  delete process.env.BEHALFID_LOG_METADATA;
  delete process.env.BEHALFID_WEBHOOK_SIGNING_PEPPER;
});
