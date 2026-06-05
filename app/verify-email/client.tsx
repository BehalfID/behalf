"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Logo } from "@/components/ui";

type State = "idle" | "verifying" | "success" | "error" | "resending" | "resent" | "code-entry" | "code-verifying";

const POLL_INTERVAL_MS = 3000;

export function VerifyEmailClient({ token }: { token?: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>(token ? "verifying" : "idle");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // When no token in URL: poll for verification status so another device
  // completing verification automatically redirects this tab to dashboard.
  useEffect(() => {
    if (token) return;

    const poll = async () => {
      try {
        const res = await fetch("/api/auth/verification-status", {
          credentials: "include"
        });
        if (res.ok) {
          const body = await res.json() as { verified: boolean };
          if (body.verified) {
            clearInterval(pollRef.current!);
            router.push("/dashboard");
          }
        }
      } catch {
        // Network error — keep polling
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [token, router]);

  // When token is present: verify it immediately.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token })
        });
        if (cancelled) return;
        if (res.ok) {
          setState("success");
        } else {
          const body = await res.json().catch(() => null) as { error?: string } | null;
          setMessage(body?.error ?? "Verification failed.");
          setState("error");
        }
      } catch {
        if (!cancelled) {
          setMessage("Network error. Please try again.");
          setState("error");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [token]);

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = code.replace(/-/g, "").toUpperCase();
    if (normalized.length !== 8) {
      setMessage("Please enter a valid 8-character code (e.g. 1Z2X-9A8B).");
      return;
    }
    setState("code-verifying");
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      if (res.ok) {
        setState("success");
      } else {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setMessage(body?.error ?? "Verification failed.");
        setState("error");
      }
    } catch {
      setMessage("Network error. Please try again.");
      setState("error");
    }
  };

  const formatCode = (value: string) => {
    const clean = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8);
    return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
  };

  const resend = async () => {
    setState("resending");
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" }
      });
    } catch {
      // Intentionally swallow — always show resent to avoid leaking session state.
    }
    setState("resent");
  };

  return (
    <main id="main-content" className="auth-page" tabIndex={-1}>
      <section className="auth-shell">
        <div className="auth-context">
          <Logo />
          <div>
            <p className="section-kicker">Email verification</p>
            <h2>One more step.</h2>
            <p>Verify your email address to enable API access, agent creation, and developer token management.</p>
          </div>
        </div>
        <div className="auth-panel">
          <p className="section-kicker">Account activation</p>

          {state === "verifying" && (
            <>
              <h1>Verifying your email…</h1>
              <p>Please wait.</p>
            </>
          )}

          {state === "success" && (
            <>
              <h1>Email verified.</h1>
              <p>Your account is now active. You can access the full developer dashboard.</p>
              <Link href="/dashboard"><Button variant="primary">Go to dashboard</Button></Link>
            </>
          )}

          {state === "error" && (
            <>
              <h1>Verification failed.</h1>
              <p className="form-error" role="alert">{message}</p>
              <p>Your link may have expired. Request a new verification email below.</p>
              <Button variant="primary" onClick={resend}>Resend verification email</Button>
            </>
          )}

          {state === "idle" && (
            <>
              <h1>Check your email.</h1>
              <p>A verification link and 8-character code were sent to your email address.</p>
              <p>This page will automatically redirect once your email is verified.</p>
              <form onSubmit={submitCode} style={{ margin: "24px 0" }}>
                <label className="form-label" htmlFor="verify-code">Enter your verification code</label>
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <input
                    id="verify-code"
                    className="form-input"
                    type="text"
                    inputMode="text"
                    autoComplete="one-time-code"
                    placeholder="XXXX-XXXX"
                    value={code}
                    onChange={e => setCode(formatCode(e.target.value))}
                    maxLength={9}
                    style={{ fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase", flex: 1 }}
                  />
                  <Button variant="primary" type="submit">Verify</Button>
                </div>
                {message && <p className="form-error" role="alert" style={{ marginTop: "8px" }}>{message}</p>}
              </form>
              <p style={{ fontSize: "13px", color: "var(--color-muted, #71717a)" }}>Did not receive it? Check your spam folder, or <button className="link-btn" type="button" onClick={resend}>resend</button>.</p>
            </>
          )}

          {state === "code-verifying" && (
            <>
              <h1>Verifying code…</h1>
              <p>Please wait.</p>
            </>
          )}

          {state === "resending" && (
            <>
              <h1>Sending…</h1>
            </>
          )}

          {state === "resent" && (
            <>
              <h1>Verification email sent.</h1>
              <p>Check your inbox. This page will automatically redirect once your email is verified.</p>
            </>
          )}

          <p className="auth-alt" style={{ marginTop: "24px" }}>
            <Link href="/login">Back to login</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
