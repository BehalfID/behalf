/**
 * Credential / secret detection helpers.
 *
 * Evidence must never include the secret value itself — only key names,
 * env var names, and redacted hints.
 */
export type CredentialHit = {
    /** Env / config key name (never the value). */
    key: string;
    /** Why it was flagged. */
    reason: string;
};
/**
 * Scan an env map for credential exposure.
 * Returns hits describing keys only — values are never returned.
 */
export declare function detectCredentialKeys(env: Record<string, string> | undefined): CredentialHit[];
/** Redact a credential value for display (should rarely be needed). */
export declare function redactCredentialValue(_value: string): string;
