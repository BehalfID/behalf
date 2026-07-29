/**
 * Scoped activation types for BehalfID CLI protection.
 */

export type BehalfActivationMode =
  | "session"
  | "timed"
  | "repository"
  | "always"
  | "disabled";

export type ActivationAgent = "cursor" | "codex" | "claude" | "other";

export type ActivationSource =
  | "user"
  | "organization"
  | "managed-profile"
  | "default"
  | "flag"
  | "env";

export interface BehalfActivationDecision {
  id: string;
  mode: BehalfActivationMode;
  enabled: boolean;
  repositoryRoot?: string;
  createdAt: string;
  expiresAt?: string;
  source: ActivationSource;
  agent?: ActivationAgent;
  lastUsedAt?: string;
}

export interface ActivationStore {
  version: 1;
  alwaysEnabled: boolean;
  timed: BehalfActivationDecision[];
  repositories: Array<{
    root: string;
    enabled: boolean;
    createdAt: string;
    updatedAt?: string;
    id: string;
    source: ActivationSource;
    /** Reserved for future identity fields (path-based for now). */
    identity?: { kind: "path"; value: string };
  }>;
}

export interface ActivationResolution {
  enabled: boolean;
  mode: BehalfActivationMode | "organization" | "managed-profile";
  reason: string;
  source: ActivationSource | string;
  repositoryRoot?: string;
  expiresAt?: string;
  shouldPrompt: boolean;
  sessionId?: string;
}

/** From managed profile session policy, if already resolved. */
export type ManagedPolicyMode = "unmanaged" | "managed" | "required" | null;

export type RepositoryDecision = ActivationStore["repositories"][number];

export type ListedDecision = {
  kind: "always" | "timed" | "repository";
  id?: string;
  enabled: boolean;
  root?: string;
  expiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
  source?: ActivationSource;
  lastUsedAt?: string;
  mode?: BehalfActivationMode;
};

export type PromptChoice =
  | { mode: "session" }
  | { mode: "timed"; duration: string }
  | { mode: "repository"; root?: string }
  | { mode: "always" }
  | { mode: "disabled" };

export type ResetDecisionsScope = {
  always?: boolean;
  timed?: boolean;
  /** `true` clears all repo decisions; a string clears that canonical root only. */
  repositories?: boolean | string;
};
