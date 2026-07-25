import { resolveSessionCookieDomain } from "@/lib/subdomainRouting";

type SessionCookieBase = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
  domain?: string;
};

/**
 * Shared session cookie attributes for developer auth.
 * Domain is only set when BEHALFID_COOKIE_DOMAIN is configured (staging/prod
 * multi-subdomain). Localhost stays host-only.
 */
export function sessionCookieOptions(input: {
  maxAge: number;
  env?: NodeJS.ProcessEnv;
}): SessionCookieBase {
  const env = input.env ?? process.env;
  const domain = resolveSessionCookieDomain(env);
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: input.maxAge,
    ...(domain ? { domain } : {})
  };
}
