import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_INSTALLATION_SPEC,
  getDefaultInstallationSpec,
  loadBundledInstallationSpec,
  loadInstallationSpecFromFile,
  parseInstallationSpec,
  resolveBundledSpecPath,
  serializeInstallationSpec,
} from "../../src/spec/index.js";

const SPEC_PATH = resolveBundledSpecPath(import.meta.url);

describe("parseInstallationSpec", () => {
  it("accepts the default in-memory spec", () => {
    const parsed = parseInstallationSpec(DEFAULT_INSTALLATION_SPEC);
    expect(parsed.name).toBe("BehalfID");
    expect(parsed.version).toBe(1);
    expect(parsed.commands.install.successJsonField).toBe("success");
  });

  it("rejects unsupported schema versions", () => {
    expect(() =>
      parseInstallationSpec({
        ...DEFAULT_INSTALLATION_SPEC,
        version: 99,
      }),
    ).toThrow(/version/);
  });

  it("rejects unknown client ids", () => {
    expect(() =>
      parseInstallationSpec({
        ...DEFAULT_INSTALLATION_SPEC,
        supportedClients: ["unknown-client"],
      }),
    ).toThrow(/client/);
  });
});

describe("spec/behalfid-install.spec.yaml", () => {
  it("loads and matches the canonical default spec", async () => {
    const fromFile = await loadInstallationSpecFromFile(SPEC_PATH);
    const fromDefault = getDefaultInstallationSpec();
    expect(fromFile).toEqual(fromDefault);
  });

  it("round-trips through YAML serialization", async () => {
    const raw = await readFile(SPEC_PATH, "utf8");
    const parsed = parseInstallationSpec(parseYaml(raw));
    const reserialized = serializeInstallationSpec(parsed);
    const reparsed = parseInstallationSpec(parseYaml(reserialized));
    expect(reparsed).toEqual(parsed);
  });

  it("documents JSON-first commands for AI agents", async () => {
    const spec = await loadInstallationSpecFromFile(SPEC_PATH);
    expect(spec.commands.install.command).toContain("--json");
    expect(spec.commands.verify.command).toContain("doctor --json");
    expect(spec.detection.statusCommand).toContain("status --json");
  });

  it("loads via resolveBundledSpecPath regardless of process cwd", async () => {
    const fromBundled = await loadBundledInstallationSpec(
      new URL("../../src/spec/loadSpec.ts", import.meta.url).href,
    );
    expect(fromBundled).toEqual(getDefaultInstallationSpec());
  });
});
