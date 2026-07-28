/**
 * Scoped activation / protection module.
 *
 * Path-aware activation scopes, atomic local store (`~/.behalf/protection.json`),
 * session env propagation, and central precedence resolver.
 */

export type {
  ActivationAgent,
  ActivationResolution,
  ActivationSource,
  ActivationStore,
  BehalfActivationDecision,
  BehalfActivationMode,
  ListedDecision,
  ManagedPolicyMode,
  PromptChoice,
  RepositoryDecision,
  ResetDecisionsScope,
} from "./types.js";

export {
  canonicalizePath,
  isPathInsideOrEqual,
  normalizeDriveLetter,
  pathDepth,
  pathsEqual,
} from "./paths.js";

export {
  PROTECTION_FILE_NAME,
  addTimedDecision,
  atomicWriteFile,
  dedupeRepositories,
  disableAlways,
  emptyActivationStore,
  enableAlways,
  findActiveTimedDecision,
  getProtectionDir,
  getProtectionFilePath,
  listDecisions,
  purgeExpiredTimed,
  readActivationStore,
  removeRepositoryDecision,
  resetDecisions,
  touchDecision,
  upsertRepositoryDecision,
  writeActivationStore,
} from "./store.js";

export {
  applyPromptChoice,
  findMatchingRepositoryDecision,
  resolveActivation,
  type ApplyPromptChoiceOptions,
  type ResolveActivationInput,
} from "./resolve.js";

export {
  ENV_ENABLED,
  ENV_MODE,
  ENV_REPO_ROOT,
  ENV_SESSION_ID,
  buildActivationEnv,
  createActivationSessionId,
  isWellFormedSessionId,
  readSessionActivation,
  type SessionActivation,
} from "./session.js";

export {
  PROTECTION_EVENTS_LOG_NAME,
  appendProtectionEvent,
  getProtectionEventsLogPath,
  type ProtectionEvent,
  type ProtectionEventDetail,
  type ProtectionEventType,
} from "./audit.js";

export {
  findBehalfMarkerRoot,
  resolveRepositoryRoot,
} from "./repo.js";

export {
  DurationParseError,
  parseDuration,
  parseDurationToIso,
} from "./parseDuration.js";
