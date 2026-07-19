const REQUIRED_PRODUCTION_ENV = [
  "MONGODB_URI",
  "BEHALFID_ADMIN_PASSWORD",
  "BEHALFID_SETUP_TOKEN",
  "NEXT_PUBLIC_APP_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRO_PRICE_ID"
] as const;

// Vercel's Upstash integration injects KV_REST_API_URL / KV_REST_API_TOKEN.
// Self-hosted deployments may use UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.
// Redis is required in production so rate limits are shared across all server
// instances. Without it, each Vercel function has its own independent counter,
// allowing an attacker to exceed the cap by distributing requests (M-2).
function hasRedisConfig() {
  return (
    (Boolean(process.env.KV_REST_API_URL?.trim()) && Boolean(process.env.KV_REST_API_TOKEN?.trim())) ||
    (Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim()) && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN?.trim()))
  );
}

const OPTIONAL_PRODUCTION_ENV = [
  "BEHALFID_WEBHOOK_SIGNING_PEPPER"
] as const;

const UNSAFE_ADMIN_PASSWORDS = new Set(["change-me", "changeme", "password", "admin", "replace-this-password"]);

type EnvValidationResult = {
  valid: boolean;
  missingRequired: string[];
  invalid: string[];
  warnings: string[];
};

const globalForEnv = globalThis as typeof globalThis & {
  behalfEnvValidated?: boolean;
  behalfEnvWarnings?: Set<string>;
};

function hasValue(name: string) {
  return Boolean(process.env[name]?.trim());
}

function isProduction() {
  // VERCEL_ENV distinguishes real production from preview deployments.
  // Both run with NODE_ENV=production, but only production has the full
  // required env var set. Fall back to NODE_ENV for non-Vercel hosts.
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV === "production";
  }
  return process.env.NODE_ENV === "production";
}

function validateHttpsUrl(name: string, result: EnvValidationResult) {
  const value = process.env[name]?.trim();
  if (!value) return;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      result.invalid.push(`${name} must use https:// in production.`);
    }
  } catch {
    result.invalid.push(`${name} must be a valid URL.`);
  }
}

export function validateProductionEnv(): EnvValidationResult {
  const result: EnvValidationResult = {
    valid: true,
    missingRequired: [],
    invalid: [],
    warnings: []
  };

  if (!isProduction()) {
    return result;
  }

  for (const name of REQUIRED_PRODUCTION_ENV) {
    if (!hasValue(name)) {
      result.missingRequired.push(name);
    }
  }

  if (!hasRedisConfig()) {
    result.missingRequired.push("KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)");
  }

  const adminPassword = process.env.BEHALFID_ADMIN_PASSWORD?.trim().toLowerCase();
  if (adminPassword && UNSAFE_ADMIN_PASSWORDS.has(adminPassword)) {
    result.invalid.push("BEHALFID_ADMIN_PASSWORD must not use a placeholder or default value.");
  }

  validateHttpsUrl("NEXT_PUBLIC_APP_URL", result);

  const hasStripeKey = hasValue("STRIPE_SECRET_KEY");
  const hasStripeWebhookSecret = hasValue("STRIPE_WEBHOOK_SECRET");
  if (hasStripeKey !== hasStripeWebhookSecret) {
    result.warnings.push(
      "Stripe billing is partially configured; set both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET or neither."
    );
  }

  for (const name of OPTIONAL_PRODUCTION_ENV) {
    if (!hasValue(name)) {
      result.warnings.push(`${name} is not configured.`);
    }
  }

  const hasGoogleId = hasValue("GOOGLE_CLIENT_ID");
  const hasGoogleSecret = hasValue("GOOGLE_CLIENT_SECRET");
  if (hasGoogleId !== hasGoogleSecret) {
    result.warnings.push(
      "Google sign-in is partially configured; set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET or neither."
    );
  } else if (!hasGoogleId) {
    result.warnings.push(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured; Sign in with Google is disabled."
    );
  }

  if (process.env.BEHALFID_PUBLIC_AGENT_CREATION === "true") {
    result.warnings.push("BEHALFID_PUBLIC_AGENT_CREATION=true allows anonymous agent creation.");
  }

  result.valid = result.missingRequired.length === 0 && result.invalid.length === 0;
  return result;
}

export function assertProductionEnv() {
  if (!isProduction() || globalForEnv.behalfEnvValidated) {
    return;
  }

  const result = validateProductionEnv();
  if (!result.valid) {
    throw new Error(
      [
        "BehalfID production environment validation failed.",
        result.missingRequired.length ? `Missing required env vars: ${result.missingRequired.join(", ")}.` : "",
        result.invalid.length ? `Invalid env configuration: ${result.invalid.join(" ")}` : ""
      ].filter(Boolean).join(" ")
    );
  }

  const emitted = globalForEnv.behalfEnvWarnings ?? new Set<string>();
  for (const warning of result.warnings) {
    if (!emitted.has(warning)) {
      console.warn(`[behalfid] Production env warning: ${warning}`);
      emitted.add(warning);
    }
  }
  globalForEnv.behalfEnvWarnings = emitted;
  globalForEnv.behalfEnvValidated = true;
}
