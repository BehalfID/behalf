import { describe, expect, it, vi } from "vitest";
import { ActionBlockedError, enforceAction, formatDecision } from "../examples/enforcement-demo/src/enforcement";

describe("enforcement demo helper", () => {
  it("runs the executor only after an allowed decision", async () => {
    const verify = vi.fn().mockResolvedValue({
      requestId: "req_allowed",
      allowed: true,
      reason: "Action allowed by active permission.",
      risk: "low"
    });
    const execute = vi.fn().mockResolvedValue("executed");

    await expect(
      enforceAction({ verify }, "agent_demo", { action: "browse_web", resource: "web" }, execute)
    ).resolves.toBe("executed");

    expect(verify).toHaveBeenCalledWith({
      agentId: "agent_demo",
      action: "browse_web",
      resource: "web"
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("throws and never runs the executor after a denied decision", async () => {
    const verify = vi.fn().mockResolvedValue({
      requestId: "req_denied",
      allowed: false,
      reason: "Amount exceeds maxAmount constraint.",
      risk: "high"
    });
    const execute = vi.fn().mockResolvedValue("executed");

    await expect(
      enforceAction(
        { verify },
        "agent_demo",
        { action: "purchase", vendor: "example-store.com", amount: 742 },
        execute
      )
    ).rejects.toBeInstanceOf(ActionBlockedError);

    expect(execute).not.toHaveBeenCalled();
  });

  it("formats decisions for demo output", () => {
    expect(
      formatDecision({
        requestId: "req_denied",
        allowed: false,
        reason: "Permission requires approval before execution.",
        risk: "medium"
      })
    ).toBe("denied (medium) - Permission requires approval before execution.");
  });
});
