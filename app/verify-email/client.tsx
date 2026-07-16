"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell, AuthStateMark, AuthTaskHeader, FormAlert } from "@/components/auth/AuthShell";
import { Button, ButtonLink, Field, FieldLabel, Input } from "@/components/ui";

type State = "idle" | "verifying" | "success" | "error" | "resending" | "resent" | "code-verifying";

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

  return (
    <AuthShell compact returnHref="/login" returnLabel="Back to login">
      <section className="auth-task">
        {state === "verifying" ? (
          <>
            <AuthStateMark tone="pending" />
            <AuthTaskHeader
              eyebrow="Account activation"
              title="Verifying your email"
              description="We’re checking the verification link. This should only take a moment."
            />
            <FormAlert tone="notice">Verification is in progress.</FormAlert>
          </>
        ) : null}

        {state === "success" ? (
          <>
            <AuthStateMark tone="success" />
            <AuthTaskHeader
              eyebrow="Account activated"
              title="Email verified"
              description="Your email is confirmed. Agent creation and developer credentials are now available."
            />
            <ButtonLink href="/dashboard" variant="primary">Go to dashboard</ButtonLink>
          </>
        ) : null}

        {state === "error" ? (
          <>
            <AuthStateMark tone="error" />
            <AuthTaskHeader
              eyebrow="Verification unavailable"
              title="We couldn’t verify this email"
              description="The link or code may be invalid or expired. Request a new verification message to try again."
            />
            <FormAlert>{message}</FormAlert>
            <Button variant="primary" onClick={resend} type="button">Resend verification email</Button>
          </>
        ) : null}

        {state === "idle" ? (
          <>
            <AuthTaskHeader
              eyebrow="Account activation"
              title="Verify your email"
              description="Use the link or 8-character code from your verification message. This page will continue automatically when your email is confirmed."
            />
            <form onSubmit={submitCode}>
              <div className="auth-task__code-row">
                <Field>
                  <FieldLabel htmlFor="verify-code">Verification code</FieldLabel>
                  <Input
                    aria-describedby={message ? "verification-code-error" : undefined}
                    autoComplete="one-time-code"
                    id="verify-code"
                    inputMode="text"
                    maxLength={9}
                    onChange={(event) => setCode(formatCode(event.target.value))}
                    placeholder="XXXX-XXXX"
                    type="text"
                    value={code}
                  />
                </Field>
                <Button variant="primary" type="submit">Verify code</Button>
              </div>
            </form>
            {message ? <FormAlert id="verification-code-error">{message}</FormAlert> : null}
            <div className="auth-task__resend">
              <p className="auth-task__meta">Need a new message?</p>
              <Button onClick={resend} size="small" type="button" variant="ghost">Resend verification email</Button>
            </div>
          </>
        ) : null}

        {state === "code-verifying" ? (
          <>
            <AuthStateMark tone="pending" />
            <AuthTaskHeader
              eyebrow="Account activation"
              title="Checking your code"
              description="We’re validating the code against your account."
            />
            <FormAlert tone="notice">Verification is in progress.</FormAlert>
          </>
        ) : null}

        {state === "resending" ? (
          <>
            <AuthStateMark tone="pending" />
            <AuthTaskHeader
              eyebrow="Email verification"
              title="Requesting a new message"
              description="Keep this page open while the request completes."
            />
            <FormAlert tone="notice">Resend request is pending.</FormAlert>
          </>
        ) : null}

        {state === "resent" ? (
          <>
            <AuthStateMark tone="success" />
            <AuthTaskHeader
              eyebrow="Resend complete"
              title="Verification message requested"
              description="If your account still needs verification, check your inbox for a new link and code. This page will continue automatically after confirmation."
            />
            <FormAlert tone="success">The resend request completed.</FormAlert>
          </>
        ) : null}

        <p className="auth-task__row auth-task__row--center">
          <Link href="/login">Back to login</Link>
        </p>
      </section>
    </AuthShell>
  );
}
