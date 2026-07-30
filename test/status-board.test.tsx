import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusBoard } from "@/components/status/StatusBoard";
import { unknownStatus } from "@/lib/statusHealth";

describe("StatusBoard", () => {
  it("renders degraded and unknown states without client hooks", () => {
    const degraded = unknownStatus("2026-01-01T00:00:00.000Z");
    degraded.overall = "degraded";
    degraded.services[0]!.state = "degraded";

    const html = renderToStaticMarkup(createElement(StatusBoard, { status: degraded }));
    expect(html).toContain("status-banner--performance");
    expect(html).toContain("Some systems are degraded");
    expect(html).toContain("Refresh status");
    expect(html).toContain('href="/status"');
  });

  it("shows incident-unavailable copy instead of throwing", () => {
    const payload = unknownStatus("2026-01-01T00:00:00.000Z");
    const html = renderToStaticMarkup(createElement(StatusBoard, { status: payload }));

    expect(html).toContain("status-banner--unknown");
    expect(html).toContain("Current status unavailable");
    expect(html).toContain("Incident history is temporarily unavailable.");
    expect(html).not.toContain("REQUEST INTERRUPTED");
  });

  it("lists grouped services for the public board", () => {
    const payload = unknownStatus("2026-01-01T00:00:00.000Z");
    const html = renderToStaticMarkup(createElement(StatusBoard, { status: payload }));

    expect(html).toContain("Dashboard &amp; web");
    expect(html).toContain("Verification API");
    expect(html).toContain("Database");
  });
});
