import { describe, expect, it } from "vitest";
import { parseBehalfCommand } from "@/lib/browserCli/parse";

describe("parseBehalfCommand", () => {
  it("parses help", () => {
    expect(parseBehalfCommand("behalf --help")).toEqual({ kind: "help" });
    expect(parseBehalfCommand("behalf")).toEqual({ kind: "help" });
  });

  it("rejects shell binaries and operators", () => {
    expect(parseBehalfCommand("bash -lc ls").kind).toBe("rejected");
    expect(parseBehalfCommand("curl https://example.com").kind).toBe("rejected");
    expect(parseBehalfCommand("behalf agents list && rm -rf /").kind).toBe("rejected");
    expect(parseBehalfCommand("python -c 'print(1)'").kind).toBe("rejected");
  });

  it("parses agents and permissions list", () => {
    expect(parseBehalfCommand("behalf agents list")).toEqual({ kind: "agents_list" });
    expect(parseBehalfCommand("behalf permissions list agent_abc")).toEqual({
      kind: "permissions_list",
      agentId: "agent_abc"
    });
  });

  it("parses verify with flags", () => {
    expect(
      parseBehalfCommand("behalf verify agent_1 --action purchase --vendor amazon.com --amount 25")
    ).toEqual({
      kind: "verify",
      agentId: "agent_1",
      action: "purchase",
      vendor: "amazon.com",
      amount: 25,
      shadow: false
    });
  });

  it("rejects unknown behalf subcommands cleanly", () => {
    const result = parseBehalfCommand("behalf nuke everything");
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") {
      expect(result.message).toMatch(/Unsupported command/);
    }
  });
});
