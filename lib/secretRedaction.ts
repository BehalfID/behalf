/**
 * Best-effort secret redaction for logs and approval previews.
 *
 * Recognizes Bearer tokens and BehalfID / webhook key formats. Does not claim
 * to detect arbitrary shell secrets — callers should avoid placing secrets in
 * command arguments or file paths shown to reviewers.
 */
export function redactSecrets(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/bhf_sk_[A-Za-z0-9._~+/-]+=*/g, "bhf_sk_[redacted]")
    .replace(/bhf_dev_[A-Za-z0-9._~+/-]+=*/g, "bhf_dev_[redacted]")
    .replace(/bhf_pass_[A-Za-z0-9._~+/-]+=*/g, "bhf_pass_[redacted]")
    .replace(/bhf_site_[A-Za-z0-9._~+/-]+=*/g, "bhf_site_[redacted]")
    .replace(/whsec_[A-Za-z0-9._~+/-]+=*/g, "whsec_[redacted]")
    // Email-verification and password-reset tokens are bare base64url with no
    // prefix to match on, and travel as ?token=. Sentry captures request URLs
    // regardless of sendDefaultPii, so redact them by parameter name.
    .replace(/([?&](?:token|code|state|secret)=)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]");
}
