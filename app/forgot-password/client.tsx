"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Button, Logo } from "@/components/ui";

type State = "idle" | "submitting" | "sent";

export function ForgotPasswordClient() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setState("submitting");

    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
    } catch {
      // Intentionally fall through — always show "sent" to avoid email enumeration.
    }

    setState("sent");
  };

  if (state === "sent") {
    return (
      <main id="main-content" className="auth-page" tabIndex={-1}>
        <section className="auth-shell">
          <div className="auth-context">
            <Logo />
            <div>
              <p className="section-kicker">Password reset</p>
              <h2>Check your email.</h2>
            </div>
          </div>
          <div className="auth-panel">
            <p className="section-kicker">Reset link sent</p>
            <h1>Check your inbox.</h1>
            <p>If an account with that email address exists, a password reset link has been sent. The link expires in 60 minutes.</p>
            <p>Check your spam folder if it does not appear within a few minutes.</p>
            <p className="auth-alt" style={{ marginTop: "24px" }}>
              <Link href="/login">Back to login</Link>
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main id="main-content" className="auth-page" tabIndex={-1}>
      <section className="auth-shell">
        <div className="auth-context">
          <Logo />
          <div>
            <p className="section-kicker">Password reset</p>
            <h2>Reset your password.</h2>
            <p>Enter your account email address and we will send you a reset link.</p>
          </div>
        </div>
        <form className="auth-panel" onSubmit={submit}>
          <p className="section-kicker">Account recovery</p>
          <h1>Forgot your password?</h1>
          <p>Enter the email address for your BehalfID developer account.</p>
          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          {error ? <p className="form-error" role="alert" aria-live="assertive">{error}</p> : null}
          <Button variant="primary" type="submit" disabled={state === "submitting"}>
            {state === "submitting" ? "Sending…" : "Send reset link"}
          </Button>
          <p className="auth-alt">
            <Link href="/login">Back to login</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
