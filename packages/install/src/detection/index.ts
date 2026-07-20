export {
  HostPlatformDetector,
  createHostPlatformDetector,
} from "./HostPlatformDetector.js";
export type { HostPlatformDetectorOptions } from "./HostPlatformDetector.js";

export {
  pathExists,
  createCommandExists,
} from "./fs.js";
export type { PathExistsFn, CommandExistsFn } from "./fs.js";

export {
  detectPackageManagers,
  resolveOperatingSystem,
} from "./packageManagers.js";

export {
  cursorPaths,
  claudeCodePaths,
  claudeDesktopPaths,
  codexPaths,
  vscodePaths,
  windsurfPaths,
} from "./paths.js";
export type { DetectionPathContext } from "./paths.js";

export {
  detectAllClients,
  detectCursor,
  detectClaudeCode,
  detectClaudeDesktop,
  detectCodex,
  detectVscode,
  detectWindsurf,
} from "./clients/index.js";
