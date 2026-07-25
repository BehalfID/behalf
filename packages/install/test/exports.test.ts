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
    expect(typeof api.HostPlatformDetector).toBe("function");
    expect(typeof api.createHostPlatformDetector).toBe("function");
    expect(typeof api.detectPackageManagers).toBe("function");
    expect(typeof api.FileMcpConfigManager).toBe("function");
    expect(typeof api.createFileMcpConfigManager).toBe("function");
    expect(typeof api.detectMcpConfigFormat).toBe("function");
    expect(typeof api.RuntimeCatalog).toBe("function");
    expect(typeof api.createDefaultRuntimeCatalog).toBe("function");
    expect(typeof api.MemoryRuntimeRegistrar).toBe("function");
    expect(typeof api.StateRuntimeRegistrar).toBe("function");
    expect(api.mcpRuntimeDefinition.id).toBe("mcp-runtime");
    expect(typeof api.InstallationVerifier).toBe("function");
    expect(typeof api.createInstallationVerifier).toBe("function");
    expect(typeof api.probeVerifyEndpoint).toBe("function");
    expect(typeof api.createDefaultInstaller).toBe("function");
    expect(typeof api.getDefaultInstallationSpec).toBe("function");
    expect(typeof api.parseInstallationSpec).toBe("function");
    expect(api.DEFAULT_INSTALLATION_SPEC.name).toBe("BehalfID");
  });

  it("can construct a state manager from the public export", () => {
    const manager = new api.FileStateManager({
      stateFilePath: "/tmp/behalf-install-export-check.json",
    });
    expect(manager.stateFilePath).toContain("behalf-install-export-check.json");
  });
});
