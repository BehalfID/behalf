"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { ContinueWithGitHub } from "@/components/auth/ContinueWithGitHub";
import { ContinueWithGoogle } from "@/components/auth/ContinueWithGoogle";
import { ContinueWithPasskey } from "@/components/auth/ContinueWithPasskey";
import { FormAlert } from "@/components/auth/AuthShell";
import {
  AuthDivider,
  AuthField,
  AuthFooterLinks,
  AuthShell,
  authInputClass,
  authOAuthButtonClass,
  authPrimaryButtonClass
} from "@/components/auth/lovable/AuthShell";
import { cn } from "@/lib/cn";
import { oauthErrorMessage } from "@/lib/authProviders/oauthErrors";
import { assignOwnedLocation, crossAppClickHandler } from "@/lib/subdomainRouting";

/** Returns the latest date of birth that satisfies the minimum age (YYYY-MM-DD). */
function maxDateOfBirth(minAge: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - minAge);
  return d.toISOString().split("T")[0];
}

function safeNextPath(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export function AuthPage({
  mode,
  nextPath,
  initialEmail = "",
  googleEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID),
  githubEnabled = false,
  passkeyEnabled = false
}: {
  mode: "login" | "signup";
  nextPath?: string;
  initialEmail?: string;
  googleEnabled?: boolean;
  githubEnabled?: boolean;
  passkeyEnabled?: boolean;
}) {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  // `error` carries legacy free-text from the Google callback; `oauth_error`
  // carries a code so the wording lives in the app rather than in a redirect URL.
  const oauthError = useMemo(() => {
    const code = searchParams.get("oauth_error")?.trim();
    if (code) return oauthErrorMessage(code);
    return searchParams.get("error")?.trim() || "";
  }, [searchParams]);
  const oauthMfaPending = searchParams.get("oauth_mfa") === "1";
  const [error, setError] = useState(oauthError);
  const [submitting, setSubmitting] = useState(false);
  // A GitHub sign-in that needs a second factor arrives here by redirect with
  // the challenge held in an httpOnly cookie, so there is no token to keep.
  // Passkey MFA may stash a token in sessionStorage instead.
  const [mfaToken, setMfaToken] = useState<string | null>(() => {
    if (!oauthMfaPending) return null;
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("behalfid_mfa_token");
      if (stored) {
        sessionStorage.removeItem("behalfid_mfa_token");
        return stored;
      }
    }
    return "";
  });
  const [mfaCode, setMfaCode] = useState("");
  const redirectPath = safeNextPath(nextPath) ?? (mode === "signup" ? "/verify-email" : "/dashboard");
  const showOauth = googleEnabled || githubEnabled;
  const showPasskey = mode === "login" && passkeyEnabled;

  const submitMfa = async (event: FormEvent) => {
    event.preventDefault();
    if (mfaToken === null) return;
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        // An empty token means the challenge is in the OAuth cookie instead.
        body: JSON.stringify(mfaToken ? { mfaToken, code: mfaCode } : { code: mfaCode })
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "MFA verification failed.");
        return;
      }
      assignOwnedLocation(redirectPath);
    } catch {
      setError("We could not reach BehalfID. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (mode === "signup") {
      if (!dateOfBirth) {
        setError("Date of birth is required.");
        return;
      }
      const dob = new Date(dateOfBirth);
      const ageLimitDate = new Date();
      ageLimitDate.setFullYear(ageLimitDate.getFullYear() - 13);
      if (dob > ageLimitDate) {
        setError("You must be at least 13 years old to create an account.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { email, password, dateOfBirth } : { email, password })
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Authentication failed.");
        return;
      }

      const body = (await response.json().catch(() => null)) as {
        user?: { emailVerified?: boolean };
        mfaRequired?: boolean;
        mfaToken?: string;
      } | null;

      if (mode === "login" && body?.mfaRequired && body.mfaToken) {
        setMfaToken(body.mfaToken);
        return;
      }

      if (mode === "signup" || body?.user?.emailVerified === false) {
        assignOwnedLocation("/verify-email");
        return;
      }

      assignOwnedLocation(redirectPath);
    } catch {
      setError("We could not reach BehalfID. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (mfaToken !== null) {
    return (
      <AuthShell
        title="Authenticator code"
        description="Open your authenticator app and enter the current code for BehalfID."
        footer={
          <AuthFooterLinks className="text-center">
            <button
              className="text-primary hover:underline"
              type="button"
              onClick={() => {
                setMfaToken(null);
                setMfaCode("");
                setError("");
              }}
            >
              Back to sign in
            </button>
          </AuthFooterLinks>
        }
      >
        <form className="space-y-4" onSubmit={submitMfa} aria-busy={submitting}>
          <AuthField htmlFor="auth-mfa-code" label="Authentication code">
            <input
              autoComplete="one-time-code"
              className={authInputClass}
              id="auth-mfa-code"
              inputMode="numeric"
              onChange={(event) => setMfaCode(event.target.value)}
              pattern="[0-9]*"
              required
              value={mfaCode}
            />
          </AuthField>
          {error ? <FormAlert id="auth-submit-error">{error}</FormAlert> : null}
          <button className={authPrimaryButtonClass} disabled={submitting} type="submit">
            {submitting ? "Verifying…" : "Verify and continue"}
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={mode === "signup" ? "Create your workspace" : "Sign in"}
      description={
        mode === "signup"
          ? "Create the account you’ll use to register agents and set their operating boundaries."
          : "Enter the account credentials for your BehalfID control plane."
      }
      footer={
        <AuthFooterLinks className="text-center">
          {mode === "signup" ? "Already have an account?" : "New to BehalfID?"}{" "}
          <Link
            className="text-primary hover:underline"
            href={
              mode === "signup"
                ? `/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`
                : `/signup${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}${initialEmail ? `${nextPath ? "&" : "?"}email=${encodeURIComponent(initialEmail)}` : ""}`
            }
            onClick={crossAppClickHandler(
              mode === "signup"
                ? `/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`
                : `/signup${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}${initialEmail ? `${nextPath ? "&" : "?"}email=${encodeURIComponent(initialEmail)}` : ""}`
            )}
          >
            {mode === "signup" ? "Log in" : "Create account"}
          </Link>
        </AuthFooterLinks>
      }
    >
      <form onSubmit={submit} aria-busy={submitting}>
        {/* Login order: passkey, GitHub, Google, divider, credentials. */}
        {showOauth || showPasskey ? (
          <>
            <div className="space-y-2.5">
              {showPasskey ? (
                <ContinueWithPasskey
                  nextPath={nextPath}
                  enabled
                  stackClassName="space-y-2"
                  buttonClassName={authOAuthButtonClass}
                />
              ) : null}
              {githubEnabled ? (
                <ContinueWithGitHub mode={mode} next={nextPath} unstyled className={authOAuthButtonClass} />
              ) : null}
              {googleEnabled ? (
                <ContinueWithGoogle mode={mode} next={nextPath} unstyled className={authOAuthButtonClass} />
              ) : null}
            </div>
            <AuthDivider />
          </>
        ) : null}

        <div className="space-y-4">
          <AuthField htmlFor="auth-email" label="Email">
            <input
              aria-describedby={error ? "auth-submit-error" : undefined}
              autoComplete="email"
              className={authInputClass}
              id="auth-email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </AuthField>
          <AuthField htmlFor="auth-password" label="Password">
            <input
              aria-describedby={error ? "auth-submit-error" : undefined}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className={authInputClass}
              id="auth-password"
              minLength={10}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </AuthField>
          {mode === "signup" && (
            <AuthField htmlFor="auth-date-of-birth" label="Date of birth">
              <input
                aria-describedby={error ? "auth-submit-error" : undefined}
                autoComplete="bday"
                className={authInputClass}
                id="auth-date-of-birth"
                max={maxDateOfBirth(13)}
                onChange={(event) => setDateOfBirth(event.target.value)}
                required
                type="date"
                value={dateOfBirth}
              />
            </AuthField>
          )}
        </div>

        {error ? (
          <div className="mt-4">
            <FormAlert id="auth-submit-error">{error}</FormAlert>
          </div>
        ) : null}

        {mode === "login" ? (
          <p className="mt-3 text-right text-sm">
            <Link
              className="text-muted-foreground hover:text-foreground"
              href="/forgot-password"
              onClick={crossAppClickHandler("/forgot-password")}
            >
              Forgot password?
            </Link>
          </p>
        ) : null}

        <button className={cn(authPrimaryButtonClass, "mt-5")} disabled={submitting} type="submit">
          {submitting
            ? mode === "signup" ? "Creating account…" : "Signing in…"
            : mode === "signup" ? "Create account" : "Log in"}
        </button>

        {mode === "signup" ? (
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            By creating an account you agree to the{" "}
            <Link className="text-primary hover:underline" href="/terms" onClick={crossAppClickHandler("/terms")}>
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link className="text-primary hover:underline" href="/privacy" onClick={crossAppClickHandler("/privacy")}>
              Privacy Policy
            </Link>
            .
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}
