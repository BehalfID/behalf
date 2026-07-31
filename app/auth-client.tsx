"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { ContinueWithGitHub } from "@/components/auth/ContinueWithGitHub";
import { ContinueWithGoogle } from "@/components/auth/ContinueWithGoogle";
import { ContinueWithPasskey } from "@/components/auth/ContinueWithPasskey";
import { AuthPrinciple, AuthShell, AuthTaskHeader, FormAlert } from "@/components/auth/AuthShell";
import { Button, Field, FieldLabel, Input } from "@/components/ui";
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
        support={
          <AuthPrinciple
            eyebrow="Authorization control plane"
            title="Confirm it is you."
            description="Enter the six-digit code from your authenticator app to finish signing in."
            points={[
              { label: "Factor", value: "Password plus TOTP" },
              { label: "Expiry", value: "Challenge expires in five minutes" },
              { label: "Backup", value: "Use a backup code if you lost your device" }
            ]}
          />
        }
      >
        <form className="auth-task" onSubmit={submitMfa} aria-busy={submitting}>
          <AuthTaskHeader
            eyebrow="Two-factor authentication"
            title="Authenticator code"
            description="Open your authenticator app and enter the current code for BehalfID."
          />
          <div className="auth-task__fields">
            <Field>
              <FieldLabel htmlFor="auth-mfa-code">Authentication code</FieldLabel>
              <Input
                autoComplete="one-time-code"
                id="auth-mfa-code"
                inputMode="numeric"
                onChange={(event) => setMfaCode(event.target.value)}
                pattern="[0-9]*"
                required
                value={mfaCode}
              />
            </Field>
          </div>
          {error ? <FormAlert id="auth-submit-error">{error}</FormAlert> : null}
          <Button loading={submitting} variant="primary" type="submit">
            {submitting ? "Verifying…" : "Verify and continue"}
          </Button>
          <p className="auth-task__row auth-task__row--center">
            <button
              className="button-link"
              type="button"
              onClick={() => {
                setMfaToken(null);
                setMfaCode("");
                setError("");
              }}
            >
              Back to sign in
            </button>
          </p>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      support={
        <AuthPrinciple
          eyebrow="Authorization control plane"
          title="Every agent starts with an identity."
          description="BehalfID checks an agent’s requested action against workspace policy before it runs, then records the decision."
          points={[
            { label: "Identity", value: "One accountable identity per agent" },
            { label: "Policy", value: "Scoped permissions and approval gates" },
            { label: "Record", value: "A durable decision trail" }
          ]}
        />
      }
    >
      <form className="auth-task" onSubmit={submit} aria-busy={submitting}>
        <AuthTaskHeader
          eyebrow={mode === "signup" ? "New workspace" : "Control plane access"}
          title={mode === "signup" ? "Create your workspace" : "Sign in"}
          description={mode === "signup"
            ? "Create the account you’ll use to register agents and set their operating boundaries."
            : "Enter the account credentials for your BehalfID control plane."}
        />

        {showOauth || showPasskey ? (
          <div className="auth-task__oauth">
            {showPasskey ? <ContinueWithPasskey nextPath={nextPath} enabled /> : null}
            {githubEnabled ? <ContinueWithGitHub mode={mode} next={nextPath} /> : null}
            {googleEnabled ? <ContinueWithGoogle mode={mode} next={nextPath} /> : null}
            <p className="auth-divider" role="separator">
              <span>or</span>
            </p>
          </div>
        ) : null}

        <div className="auth-task__fields">
          <Field>
            <FieldLabel htmlFor="auth-email">Email</FieldLabel>
            <Input
              aria-describedby={error ? "auth-submit-error" : undefined}
              autoComplete="email"
              id="auth-email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="auth-password">Password</FieldLabel>
            <Input
              aria-describedby={error ? "auth-submit-error" : undefined}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              id="auth-password"
              minLength={10}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </Field>
          {mode === "signup" && (
            <Field>
              <FieldLabel htmlFor="auth-date-of-birth">Date of birth</FieldLabel>
              <Input
                aria-describedby={error ? "auth-submit-error" : undefined}
                autoComplete="bday"
                id="auth-date-of-birth"
                max={maxDateOfBirth(13)}
                onChange={(event) => setDateOfBirth(event.target.value)}
                required
                type="date"
                value={dateOfBirth}
              />
            </Field>
          )}
        </div>

        {error ? <FormAlert id="auth-submit-error">{error}</FormAlert> : null}

        {mode === "login" ? (
          <p className="auth-task__row">
            <span />
            <Link href="/forgot-password" onClick={crossAppClickHandler("/forgot-password")}>
              Forgot password?
            </Link>
          </p>
        ) : null}

        <Button loading={submitting} variant="primary" type="submit">
          {submitting
            ? mode === "signup" ? "Creating account…" : "Signing in…"
            : mode === "signup" ? "Create account" : "Log in"}
        </Button>

        {mode === "signup" ? (
          <p className="auth-task__legal">
            By creating an account you agree to the{" "}
            <Link href="/terms" onClick={crossAppClickHandler("/terms")}>
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" onClick={crossAppClickHandler("/privacy")}>
              Privacy Policy
            </Link>
            .
          </p>
        ) : null}

        <p className="auth-task__row auth-task__row--center">
          {mode === "signup" ? "Already have an account?" : "New to BehalfID?"}{" "}
          <Link
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
        </p>
      </form>
    </AuthShell>
  );
}
