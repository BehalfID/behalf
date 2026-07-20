import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { DEFAULT_INSTALLATION_SPEC } from "./defaultSpec.js";
import type { InstallationSpec, InstallationSpecCommand } from "./types.js";

const SUPPORTED_CLIENTS = new Set([
  "cursor",
  "claude-code",
  "claude-desktop",
  "codex",
  "vscode",
  "windsurf",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCommand(value: unknown, label: string): InstallationSpecCommand {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (typeof value.command !== "string" || value.command.length === 0) {
    throw new Error(`${label}.command must be a non-empty string`);
  }

  const command: InstallationSpecCommand = { command: value.command };
  if (value.exitCode !== undefined) {
    if (typeof value.exitCode !== "number") {
      throw new Error(`${label}.exitCode must be a number`);
    }
    command.exitCode = value.exitCode;
  }
  if (value.successJsonField !== undefined) {
    if (typeof value.successJsonField !== "string") {
      throw new Error(`${label}.successJsonField must be a string`);
    }
    command.successJsonField = value.successJsonField;
  }
  if (value.successJsonValue !== undefined) {
    command.successJsonValue = value.successJsonValue;
  }
  return command;
}

/** Validate and normalize an unknown value into an {@link InstallationSpec}. */
export function parseInstallationSpec(value: unknown): InstallationSpec {
  if (!isRecord(value)) {
    throw new Error("Installation spec must be a YAML object");
  }
  if (value.name !== "BehalfID") {
    throw new Error('Installation spec name must be "BehalfID"');
  }
  if (value.version !== 1) {
    throw new Error(`Unsupported installation spec version: ${String(value.version)}`);
  }
  if (value.package !== "@behalfid/install") {
    throw new Error('Installation spec package must be "@behalfid/install"');
  }
  if (typeof value.description !== "string" || value.description.length === 0) {
    throw new Error("Installation spec description must be a non-empty string");
  }
  if (!isRecord(value.commands)) {
    throw new Error("Installation spec commands must be an object");
  }
  if (!isRecord(value.detection)) {
    throw new Error("Installation spec detection must be an object");
  }
  if (!Array.isArray(value.supportedClients)) {
    throw new Error("Installation spec supportedClients must be an array");
  }
  if (!Array.isArray(value.notes)) {
    throw new Error("Installation spec notes must be an array");
  }

  for (const client of value.supportedClients) {
    if (typeof client !== "string" || !SUPPORTED_CLIENTS.has(client)) {
      throw new Error(`Unsupported client id in spec: ${String(client)}`);
    }
  }
  for (const note of value.notes) {
    if (typeof note !== "string") {
      throw new Error("Installation spec notes must be strings");
    }
  }

  const detection = value.detection;
  if (
    typeof detection.stateRelativePath !== "string" ||
    detection.stateRelativePath.length === 0
  ) {
    throw new Error("detection.stateRelativePath must be a non-empty string");
  }
  if (typeof detection.statusCommand !== "string" || detection.statusCommand.length === 0) {
    throw new Error("detection.statusCommand must be a non-empty string");
  }
  if (
    typeof detection.installedJsonField !== "string" ||
    detection.installedJsonField.length === 0
  ) {
    throw new Error("detection.installedJsonField must be a non-empty string");
  }

  return {
    name: "BehalfID",
    version: 1,
    package: "@behalfid/install",
    description: value.description,
    commands: {
      install: parseCommand(value.commands.install, "commands.install"),
      verify: parseCommand(value.commands.verify, "commands.verify"),
      status: parseCommand(value.commands.status, "commands.status"),
      upgrade: parseCommand(value.commands.upgrade, "commands.upgrade"),
      uninstall: parseCommand(value.commands.uninstall, "commands.uninstall"),
    },
    detection: {
      stateRelativePath: detection.stateRelativePath,
      statusCommand: detection.statusCommand,
      installedJsonField: detection.installedJsonField,
      ...(detection.installedJsonValue !== undefined
        ? { installedJsonValue: detection.installedJsonValue }
        : {}),
    },
    supportedClients: [...value.supportedClients],
    notes: [...value.notes],
  };
}

/** Resolve the bundled spec file path adjacent to the built package. */
export function resolveBundledSpecPath(importMetaUrl: string = import.meta.url): string {
  const moduleDir = dirname(fileURLToPath(importMetaUrl));
  // Module lives at .../{src|dist}/spec; YAML ships at package root .../spec/
  return join(moduleDir, "..", "..", "spec", "behalfid-install.spec.yaml");
}

/** Load an installation spec from a YAML file. */
export async function loadInstallationSpecFromFile(
  filePath: string,
): Promise<InstallationSpec> {
  const raw = await readFile(filePath, "utf8");
  const parsed = parseYaml(raw) as unknown;
  return parseInstallationSpec(parsed);
}

/** Load the bundled installation spec shipped with `@behalfid/install`. */
export async function loadBundledInstallationSpec(
  importMetaUrl: string = import.meta.url,
): Promise<InstallationSpec> {
  return loadInstallationSpecFromFile(resolveBundledSpecPath(importMetaUrl));
}

/** Return the in-memory canonical installation spec. */
export function getDefaultInstallationSpec(): InstallationSpec {
  return structuredClone(DEFAULT_INSTALLATION_SPEC);
}

/** Serialize an installation spec to YAML. */
export function serializeInstallationSpec(spec: InstallationSpec): string {
  return `${stringifyYaml(spec)}\n`;
}
