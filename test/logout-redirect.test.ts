import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false })),
  rateLimitError: vi.fn()
}));
vi.mock("@/lib/repositories/sessions", () => ({
  deleteByTokenHash: vi.fn(async () => undefined)
}));

import { GET } from "@/app/logout/route";

function logout(next: string) {
  const url = new URL("https://app.behalfid.test/logout");
  url.searchParams.set("next", next);
  return GET(new NextRequest(url));
}

describe("GET /logout next redirect", () => {
  it("redirects to a same-origin path", async () => {
    const res = await logout("/login?deleted=1");
    expect(res.headers.get("location")).toBe("https://app.behalfid.test/login?deleted=1");
  });

  it.each(["/\\evil.example", "/\t/evil.example", "//evil.example", "https://evil.example"])(
    "does not redirect off-origin for %j",
    async (next) => {
      const res = await logout(next);
      const location = new URL(res.headers.get("location") ?? "");
      expect(location.origin).toBe("https://app.behalfid.test");
      expect(location.pathname).toBe("/");
    }
  );
});
