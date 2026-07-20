import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";

describe("public package exports", () => {
  it("exports foundation constants and state helpers", () => {
    expect(api.INSTALLATION_STATE_SCHEMA_VERSION).toBe(1);
    expect(api.BEHALF_MCP_SERVER_NAME).toBe("behalfid");
    expect(typeof api.createInstallationState).toBe("function");
    expect(typeof api.parseInstallationState).toBe("function");
    expect(typeof api.FileStateManager).toBe("function");
    expect(typeof api.atomicWriteFile).toBe("function");
    expect(typeof api.createCliProgram).toBe("function");
    expect(typeof api.resolvePackageVersion).toBe("function");
  });

  it("can construct a state manager from the public export", () => {
    const manager = new api.FileStateManager({
      stateFilePath: "/tmp/behalf-install-export-check.json",
    });
    expect(manager.stateFilePath).toContain("behalf-install-export-check.json");
  });
});
