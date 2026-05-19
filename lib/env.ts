const REQUIRED_PRODUCTION_ENV = [
  "MONGODB_URI",
  "BEHALFID_ADMIN_PASSWORD",
  "BEHALFID_SETUP_TOKEN",
  "NEXT_PUBLIC_APP_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRO_PRICE_ID"
] as const;

const OPTIONAL_PRODUCTION_ENV = [
  "BEHALFID_WEBHOOK_SIGNING_PEPPER",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN"
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

  const adminPassword = process.env.BEHALFID_ADMIN_PASSWORD?.trim().toLowerCase();
  if (adminPassword && UNSAFE_ADMIN_PASSWORDS.has(adminPassword)) {
    result.invalid.push("BEHALFID_ADMIN_PASSWORD must not use a placeholder or default value.");
  }

  validateHttpsUrl("NEXT_PUBLIC_APP_URL", result);

  const hasRedisUrl = hasValue("UPSTASH_REDIS_REST_URL");
  const hasRedisToken = hasValue("UPSTASH_REDIS_REST_TOKEN");
  if (hasRedisUrl !== hasRedisToken) {
    result.invalid.push("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured together.");
  }
  if (!hasRedisUrl && !hasRedisToken) {
    result.warnings.push(
      "Upstash Redis is not configured; production rate limits will use per-process memory fallback."
    );
  }

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
