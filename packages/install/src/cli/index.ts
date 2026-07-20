export { createCliOutput, setExitCode } from "./output.js";
export type { CliOutput } from "./output.js";

export {
  renderInstallResult,
  renderUpgradeResult,
  renderUninstallResult,
  renderStatusResult,
  renderDoctorReport,
} from "./formatters.js";

export { createDefaultInstaller } from "./createInstaller.js";
export type { CreateDefaultInstallerOptions } from "./createInstaller.js";

export {
  handleInstall,
  handleUpgrade,
  handleUninstall,
  handleStatus,
  handleDoctor,
  createDefaultHandlerContext,
} from "./handlers.js";
export type { CliHandlerContext } from "./handlers.js";
