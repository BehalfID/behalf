"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Button, Logo } from "@/components/ui";

type State = "idle" | "submitting" | "success" | "error" | "network-error";

export function ResetPasswordClient({ token }: { token?: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");

  if (!token) {
    return (
      <main id="main-content" className="auth-page" tabIndex={-1}>
        <section className="auth-shell">
          <div className="auth-context">
            <Logo />
          </div>
          <div className="auth-panel">
            <p className="section-kicker">Password reset</p>
            <h1>Invalid reset link.</h1>
            <p>This reset link is missing or malformed. Request a new one below.</p>
            <Link href="/forgot-password"><Button variant="primary">Request new link</Button></Link>
          </div>
        </section>
      </main>
    );
  }

  if (state === "success") {
    return (
      <main id="main-content" className="auth-page" tabIndex={-1}>
        <section className="auth-shell">
          <div className="auth-context">
            <Logo />
          </div>
          <div className="auth-panel">
            <p className="section-kicker">Password reset</p>
            <h1>Password updated.</h1>
            <p>Your password has been changed. All previous sessions have been invalidated. Sign in with your new password.</p>
            <Link href="/login"><Button variant="primary">Sign in</Button></Link>
          </div>
        </section>
      </main>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setState("submitting");

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password })
      });

      if (res.ok) {
        setState("success");
      } else {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        // If we previously had a network error and now get 400, the reset likely
        // already succeeded server-side — token was consumed before the response arrived.
        if (state === "network-error" && res.status === 400) {
          setError("Your password may already have been updated. Try signing in — if it worked, you will be able to log in with your new password.");
        } else {
          setError(body?.error ?? "Password reset failed. The link may have expired.");
        }
        setState("error");
      }
    } catch {
      setError("Network error. Please try again.");
      setState("network-error");
    }
  };

  return (
    <main id="main-content" className="auth-page" tabIndex={-1}>
      <section className="auth-shell">
        <div className="auth-context">
          <Logo />
          <div>
            <p className="section-kicker">Password reset</p>
            <h2>Set a new password.</h2>
            <p>Choose a strong password for your BehalfID developer account. Minimum 10 characters.</p>
          </div>
        </div>
        <form className="auth-panel" onSubmit={submit}>
          <p className="section-kicker">Account security</p>
          <h1>Set new password.</h1>
          <label>
            <span>New password</span>
            <input
              autoComplete="new-password"
              minLength={10}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <label>
            <span>Confirm password</span>
            <input
              autoComplete="new-password"
              minLength={10}
              onChange={(event) => setConfirm(event.target.value)}
              required
              type="password"
              value={confirm}
            />
          </label>
          {error ? <p className="form-error" role="alert" aria-live="assertive">{error}</p> : null}
          <Button variant="primary" type="submit" disabled={state === "submitting" || state === "success"}>
            {state === "submitting" ? "Updating…" : "Set new password"}
          </Button>
          <p className="auth-alt">
            <Link href="/login">Back to login</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
