"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Logo } from "@/components/ui";

type State = "idle" | "verifying" | "success" | "error" | "resending" | "resent";

const POLL_INTERVAL_MS = 3000;

export function VerifyEmailClient({ token }: { token?: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>(token ? "verifying" : "idle");
  const [message, setMessage] = useState("");
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
              <p>A verification link was sent to your email address. Click it to activate your account.</p>
              <p>This page will automatically redirect once your email is verified.</p>
              <p>Did not receive it? Check your spam folder, or resend below.</p>
              <Button variant="primary" onClick={resend}>Resend verification email</Button>
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
