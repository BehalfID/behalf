export type {
  InstallationSpec,
  InstallationSpecCommand,
  InstallationSpecDetection,
  InstallationSpecSchemaVersion,
} from "./types.js";

export { DEFAULT_INSTALLATION_SPEC } from "./defaultSpec.js";

export {
  parseInstallationSpec,
  loadInstallationSpecFromFile,
  loadBundledInstallationSpec,
  getDefaultInstallationSpec,
  serializeInstallationSpec,
  resolveBundledSpecPath,
} from "./loadSpec.js";
