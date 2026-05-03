"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

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
    router.push("/dashboard");
  };

  return (
    <main className="auth-page">
      <Link className="site-logo" href="/">
        <span className="site-logo__mark">B</span>
        <span>BehalfID</span>
      </Link>
      <form className="auth-panel" onSubmit={submit}>
        <p className="section-kicker">{mode === "signup" ? "Create account" : "Developer login"}</p>
        <h1>{mode === "signup" ? "Start verifying agent actions." : "Welcome back."}</h1>
        <label>
          <span>Email</span>
          <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
        </label>
        <label>
          <span>Password</span>
          <input autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={10} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-button" type="submit">{mode === "signup" ? "Create account" : "Log in"}</button>
        <p className="auth-alt">
          {mode === "signup" ? "Already have an account?" : "New to BehalfID?"}{" "}
          <Link href={mode === "signup" ? "/login" : "/signup"}>
            {mode === "signup" ? "Log in" : "Create account"}
          </Link>
        </p>
      </form>
    </main>
  );
}
