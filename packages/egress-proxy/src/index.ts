export type {
  EgressAuthorizeRequest,
  EgressAuthorizeResponse,
  EgressMode,
  ParsedProxyTarget
} from "./types.js";
export {
  hostInList,
  hostMatchesPattern,
  normalizeHost,
  parseHostPort
} from "./types.js";
export { requestEgressAuthorization } from "./authorizeClient.js";
export { createEgressProxyServer, listenLoopback } from "./server.js";
