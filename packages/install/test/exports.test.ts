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
    expect(typeof api.BehalfInstaller).toBe("function");
    expect(typeof api.createBehalfInstaller).toBe("function");
    expect(typeof api.createDefaultRuntimeRegistration).toBe("function");
    expect(api.DEFAULT_RUNTIME_ID).toBe("mcp-runtime");
  });

  it("can construct a state manager from the public export", () => {
    const manager = new api.FileStateManager({
      stateFilePath: "/tmp/behalf-install-export-check.json",
    });
    expect(manager.stateFilePath).toContain("behalf-install-export-check.json");
  });
});
