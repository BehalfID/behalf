"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FormAlert } from "@/components/auth/AuthShell";
import {
  AuthField,
  AuthFooterLinks,
  AuthShell,
  authInputClass,
  authOAuthButtonClass,
  authPrimaryButtonClass
} from "@/components/auth/lovable/AuthShell";
import { assignOwnedLocation } from "@/lib/subdomainRouting";
import { trackEmailVerificationGate } from "@/lib/analytics/funnel";

type State = "idle" | "verifying" | "success" | "error" | "resending" | "resent" | "code-verifying";

const POLL_INTERVAL_MS = 3000;

export function VerifyEmailClient({ token }: { token?: string }) {
  const [state, setState] = useState<State>(token ? "verifying" : "idle");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Arriving here without a token means the account exists but is parked behind
  // the verification wall — the step that sits between "signed up" and "reached
  // the dashboard". Recording it is what turns an unexplained drop between
  // those two into a named stage with a size.
  const gateReported = useRef(false);
  useEffect(() => {
    if (token || gateReported.current) return;
    gateReported.current = true;
    trackEmailVerificationGate();
  }, [token]);

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
            assignOwnedLocation("/dashboard");
          }
        }
      } catch {
        // Network error — keep polling
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [token]);

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

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = code.replace(/-/g, "").toUpperCase();
    if (normalized.length !== 8) {
      setMessage("Please enter a valid 8-character code (e.g. 1Z2X-9A8B).");
      return;
    }
    setMessage("");
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

  const copy: Record<string, { title: string; description: string }> = {
    verifying: {
      title: "Verifying your email",
      description: "We’re checking the verification link. This should only take a moment."
    },
    success: {
      title: "Email verified",
      description: "Your email is confirmed. Agent creation and developer credentials are now available."
    },
    error: {
      title: "We couldn’t verify this email",
      description:
        "The link or code may be invalid or expired. Request a new verification message to try again."
    },
    idle: {
      title: "Verify your email",
      description:
        "Use the link or 8-character code from your verification message. This page will continue automatically when your email is confirmed."
    },
    "code-verifying": {
      title: "Checking your code",
      description: "We’re validating the code against your account."
    },
    resending: {
      title: "Requesting a new message",
      description: "Keep this page open while the request completes."
    },
    resent: {
      title: "Verification message requested",
      description:
        "If your account still needs verification, check your inbox for a new link and code. This page will continue automatically after confirmation."
    }
  };
  const active = copy[state] ?? copy.idle;

  return (
    <AuthShell
      title={active.title}
      description={active.description}
      footer={
        <AuthFooterLinks className="text-center">
          <Link className="text-primary hover:underline" href="/login">
            Back to login
          </Link>
        </AuthFooterLinks>
      }
    >
      {state === "verifying" || state === "code-verifying" ? (
        <FormAlert tone="notice">Verification is in progress.</FormAlert>
      ) : null}

      {state === "success" ? (
        <Link className={authPrimaryButtonClass} href="/dashboard">
          Go to dashboard
        </Link>
      ) : null}

      {state === "error" ? (
        <div className="space-y-4">
          <FormAlert>{message}</FormAlert>
          <button className={authPrimaryButtonClass} onClick={resend} type="button">
            Resend verification email
          </button>
        </div>
      ) : null}

      {state === "idle" ? (
        <div className="space-y-4">
          <form className="space-y-4" onSubmit={submitCode}>
            <AuthField htmlFor="verify-code" label="Verification code">
              <input
                aria-describedby={message ? "verification-code-error" : undefined}
                autoComplete="one-time-code"
                className={authInputClass}
                id="verify-code"
                inputMode="text"
                maxLength={9}
                onChange={(event) => setCode(formatCode(event.target.value))}
                placeholder="XXXX-XXXX"
                type="text"
                value={code}
              />
            </AuthField>
            <button className={authPrimaryButtonClass} type="submit">
              Verify code
            </button>
          </form>
          {message ? <FormAlert id="verification-code-error">{message}</FormAlert> : null}
          <div className="space-y-2 pt-2">
            <p className="text-sm text-muted-foreground">Need a new message?</p>
            <button className={authOAuthButtonClass} onClick={resend} type="button">
              Resend verification email
            </button>
          </div>
        </div>
      ) : null}

      {state === "resending" ? <FormAlert tone="notice">Resend request is pending.</FormAlert> : null}
      {state === "resent" ? <FormAlert tone="success">The resend request completed.</FormAlert> : null}
    </AuthShell>
  );
}
