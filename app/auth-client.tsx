"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, Logo } from "@/components/ui";

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

function googleAuthHref(mode: "login" | "signup", nextPath?: string) {
  const params = new URLSearchParams({ mode });
  if (nextPath) params.set("next", nextPath);
  return `/api/auth/google?${params.toString()}`;
}

export function AuthPage({
  mode,
  nextPath,
  initialEmail = "",
  googleEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID)
}: {
  mode: "login" | "signup";
  nextPath?: string;
  initialEmail?: string;
  googleEnabled?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [error, setError] = useState("");
  const redirectPath = safeNextPath(nextPath) ?? (mode === "signup" ? "/verify-email" : "/dashboard");
  const oauthError = useMemo(() => searchParams.get("error")?.trim() || "", [searchParams]);

  useEffect(() => {
    if (oauthError) setError(oauthError);
  }, [oauthError]);

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
    } | null;

    if (mode === "signup" || body?.user?.emailVerified === false) {
      router.push("/verify-email");
      return;
    }

    router.push(redirectPath);
  };

  return (
    <main id="main-content" className="auth-page" tabIndex={-1}>
      <section className="auth-shell">
        <div className="auth-context">
          <Logo />
          <div>
            <p className="section-kicker">Agent permission infrastructure</p>
            <h2>Identity and permission enforcement for coding agents.</h2>
            <p>Every agent action is verified against workspace policy before it runs — and every decision is signed and auditable.</p>
          </div>
          <div className="auth-artifact" aria-hidden="true">
            <div className="auth-artifact__head">
              <p className="cx-label">Verification event</p>
              <span className="auth-artifact__id">evt_01j8j3kf9d</span>
            </div>
            <div className="auth-artifact__body">
              <dl className="cx-record">
                <div className="cx-record__row">
                  <dt>Agent</dt>
                  <dd>deploy-bot</dd>
                </div>
                <div className="cx-record__row">
                  <dt>Action</dt>
                  <dd>github.merge → api-core/main</dd>
                </div>
                <div className="cx-record__row">
                  <dt>Policy</dt>
                  <dd>protected-branches</dd>
                </div>
                <div className="cx-record__row">
                  <dt>Decision</dt>
                  <dd><span className="cx-chip cx-chip--warn">Approval required</span></dd>
                </div>
                <div className="cx-record__row">
                  <dt>Receipt</dt>
                  <dd>signed · sha256 · 41ms</dd>
                </div>
              </dl>
            </div>
            <div className="auth-feed">
              <div className="auth-feed__row">
                <span className="auth-feed__time">14:32</span>
                <span className="auth-feed__desc">ci-runner · deploy.staging</span>
                <span className="cx-chip cx-chip--ok">Allowed</span>
              </div>
              <div className="auth-feed__row">
                <span className="auth-feed__time">14:31</span>
                <span className="auth-feed__desc">cursor-agent · secrets.read .env</span>
                <span className="cx-chip cx-chip--deny">Denied</span>
              </div>
              <div className="auth-feed__row">
                <span className="auth-feed__time">14:29</span>
                <span className="auth-feed__desc">deploy-bot · db.migrate</span>
                <span className="cx-chip cx-chip--warn">Pending</span>
              </div>
            </div>
          </div>
          <div className="auth-meta-row">
            <span>Signed decisions</span>
            <span>Scoped permissions</span>
            <span>Delegated approvals</span>
          </div>
        </div>
        <form className="auth-panel" onSubmit={submit}>
          <p className="section-kicker">{mode === "signup" ? "New workspace" : "Control plane access"}</p>
          <h1>{mode === "signup" ? "Create your workspace" : "Sign in"}</h1>
          <p>{mode === "signup" ? "Provision a control plane for the coding agents in your stack." : "Authenticate to manage agents, policies, and audit history."}</p>
          {googleEnabled ? (
            <>
              <a className="ui-button ui-button--secondary auth-google-button" href={googleAuthHref(mode, nextPath ?? undefined)}>
                Continue with Google
              </a>
              <p className="auth-divider" role="separator">
                <span>or</span>
              </p>
            </>
          ) : null}
          <label>
            <span>Email</span>
            <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label>
            <span>Password</span>
            <input autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={10} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          {mode === "signup" && (
            <label>
              <span>Date of birth</span>
              <input
                autoComplete="bday"
                max={maxDateOfBirth(13)}
                onChange={(event) => setDateOfBirth(event.target.value)}
                required
                type="date"
                value={dateOfBirth}
              />
            </label>
          )}
          {error ? <p className="form-error" role="alert" aria-live="assertive">{error}</p> : null}
          {mode === "login" && (
            <p className="auth-alt">
              <Link href="/forgot-password">Forgot password?</Link>
            </p>
          )}
          <Button variant="primary" type="submit">{mode === "signup" ? "Create account" : "Log in"}</Button>
          {mode === "signup" && (
            <p className="auth-legal">
              By creating an account you agree to the{" "}
              <Link href="/terms">Terms of Service</Link> and{" "}
              <Link href="/privacy">Privacy Policy</Link>.
            </p>
          )}
          <p className="auth-alt">
            {mode === "signup" ? "Already have an account?" : "New to BehalfID?"}{" "}
            <Link href={mode === "signup" ? `/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}` : `/signup${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}${initialEmail ? `${nextPath ? "&" : "?"}email=${encodeURIComponent(initialEmail)}` : ""}`}>
              {mode === "signup" ? "Log in" : "Create account"}
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}
