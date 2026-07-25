export {
  FileMcpConfigManager,
  createFileMcpConfigManager,
} from "./FileMcpConfigManager.js";
export type { FileMcpConfigManagerOptions } from "./FileMcpConfigManager.js";

export {
  detectMcpConfigFormat,
  refineMcpConfigFormat,
} from "./format.js";
export type { McpConfigFormat } from "./format.js";

export {
  parseMcpConfigContents,
  serializeMcpConfig,
  runtimeToServerEntry,
} from "./codec.js";

export {
  getServerMap,
  setServerMap,
  upsertServerEntry,
  removeServerEntry,
} from "./servers.js";

export {
  wrapServerEntry,
  wrapServersInConfig,
  restoreWrappedServers,
  isWrappableServerEntry,
  isAlreadyWrapped,
  WRAPPED_MARKER_ENV,
} from "./wrap.js";
export type {
  WrapServerOptions,
  WrapServersOptions,
  WrapServersResult,
  WrappedServerChange,
} from "./wrap.js";
