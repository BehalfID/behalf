import {
  createDefaultRuntimeRegistration,
  DEFAULT_RUNTIME_ID,
  DEFAULT_RUNTIME_PACKAGE,
  type CreateDefaultRuntimeRegistrationOptions,
} from "../installer/runtime.js";
import { BEHALF_MCP_SERVER_NAME, type RuntimeRegistrationInput } from "../types/index.js";

/**
 * Extensible description of a runtime the installer can register.
 * New AI/runtime targets can be added by registering additional definitions
 * without changing {@link import("../installer/BehalfInstaller.js").BehalfInstaller}.
 */
export interface RuntimeDefinition {
  /** Stable runtime id stored in installer state. */
  id: string;
  /** npm package name for the runtime. */
  packageName: string;
  /** MCP server name written into client configuration. */
  serverName: string;
  /** Logical kind recorded in registration metadata. */
  kind: string;
  /** Human-readable label. */
  displayName: string;
  /** Build a concrete registration payload for this runtime. */
  createRegistration: (
    options: CreateDefaultRuntimeRegistrationOptions,
  ) => RuntimeRegistrationInput;
}

/** Default `@behalfid/mcp-runtime` definition. */
export const mcpRuntimeDefinition: RuntimeDefinition = {
  id: DEFAULT_RUNTIME_ID,
  packageName: DEFAULT_RUNTIME_PACKAGE,
  serverName: BEHALF_MCP_SERVER_NAME,
  kind: "mcp-runtime",
  displayName: "BehalfID MCP Runtime",
  createRegistration: createDefaultRuntimeRegistration,
};

/**
 * Catalog of runtimes available for registration.
 * Starts with {@link mcpRuntimeDefinition}; callers may add more.
 */
export class RuntimeCatalog {
  private readonly definitions = new Map<string, RuntimeDefinition>();

  constructor(initial: readonly RuntimeDefinition[] = []) {
    for (const definition of initial) {
      this.register(definition);
    }
  }

  /** Add or replace a runtime definition. */
  register(definition: RuntimeDefinition): void {
    this.definitions.set(definition.id, definition);
  }

  /** Remove a runtime definition by id. */
  unregister(runtimeId: string): boolean {
    return this.definitions.delete(runtimeId);
  }

  get(runtimeId: string): RuntimeDefinition | undefined {
    return this.definitions.get(runtimeId);
  }

  has(runtimeId: string): boolean {
    return this.definitions.has(runtimeId);
  }

  list(): RuntimeDefinition[] {
    return [...this.definitions.values()];
  }
}

/** Create a catalog preloaded with the default MCP runtime. */
export function createDefaultRuntimeCatalog(): RuntimeCatalog {
  return new RuntimeCatalog([mcpRuntimeDefinition]);
}

/**
 * Resolve a registration payload from the catalog.
 * Throws when the runtime id is unknown.
 */
export function resolveRuntimeRegistration(
  catalog: RuntimeCatalog,
  runtimeId: string,
  options: CreateDefaultRuntimeRegistrationOptions,
): RuntimeRegistrationInput {
  const definition = catalog.get(runtimeId);
  if (!definition) {
    throw new Error(`Unknown runtime id: ${runtimeId}`);
  }
  return definition.createRegistration(options);
}
