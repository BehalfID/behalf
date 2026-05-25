"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button, Logo } from "@/components/ui";

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Authentication failed.");
      return;
    }
    router.push(mode === "signup" ? "/onboarding" : "/dashboard");
  };

  return (
    <main id="main-content" className="auth-page" tabIndex={-1}>
      <section className="auth-shell">
        <div className="auth-context">
          <Logo />
          <div>
            <p className="section-kicker">Agent permission infrastructure</p>
            <h2>Verify actions before agents act.</h2>
            <p>Use BehalfID to manage agent identities, scoped permissions, audit logs, and signed webhook events from one developer portal.</p>
          </div>
          <ul>
            <li>Verify agent actions</li>
            <li>Manage API keys</li>
            <li>Audit decisions</li>
            <li>Receive signed webhooks</li>
          </ul>
        </div>
        <form className="auth-panel" onSubmit={submit}>
          <p className="section-kicker">{mode === "signup" ? "Create account" : "Developer login"}</p>
          <h1>{mode === "signup" ? "Start verifying agent actions." : "Welcome back."}</h1>
          <p>{mode === "signup" ? "Create a developer workspace for agents, permissions, logs, and signed webhook events." : "Sign in to manage agents, permissions, logs, and webhook delivery."}</p>
          <label>
            <span>Email</span>
            <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label>
            <span>Password</span>
            <input autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={10} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          {error ? <p className="form-error" role="alert" aria-live="assertive">{error}</p> : null}
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
            <Link href={mode === "signup" ? "/login" : "/signup"}>
              {mode === "signup" ? "Log in" : "Create account"}
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}
