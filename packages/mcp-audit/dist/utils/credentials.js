/**
 * Credential / secret detection helpers.
 *
 * Evidence must never include the secret value itself — only key names,
 * env var names, and redacted hints.
 */
const SECRET_KEY_PATTERN = /(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|bearer|secret|password|passwd|pwd|private[_-]?key|client[_-]?secret|credentials?)/i;
const SECRET_VALUE_PATTERN = /^(Bearer\s+)?[A-Za-z0-9._~+/-]{20,}={0,2}$|^(sk|pk|rk|whsec|bhf_sk|bhf_dev|bhf_pass|ghp|gho|xox[baprs])-[A-Za-z0-9._-]{8,}$/i;
/**
 * Scan an env map for credential exposure.
 * Returns hits describing keys only — values are never returned.
 */
export function detectCredentialKeys(env) {
    if (!env)
        return [];
    const hits = [];
    for (const key of Object.keys(env)) {
        const value = env[key] ?? "";
        if (SECRET_KEY_PATTERN.test(key)) {
            hits.push({
                key,
                reason: "environment variable name suggests a credential",
            });
            continue;
        }
        if (value.length > 0 && SECRET_VALUE_PATTERN.test(value.trim())) {
            hits.push({
                key,
                reason: "environment variable value matches a credential-like pattern",
            });
        }
    }
    return hits;
}
/** Redact a credential value for display (should rarely be needed). */
export function redactCredentialValue(_value) {
    return "[redacted]";
}
