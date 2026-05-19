import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  delete process.env.BEHALFID_LOG_METADATA;
  delete process.env.BEHALFID_WEBHOOK_SIGNING_PEPPER;
});
