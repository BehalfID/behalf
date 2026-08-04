"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  AuthField,
  AuthFooterLinks,
  AuthShell,
  authInputClass,
  authPrimaryButtonClass
} from "@/components/auth/lovable/AuthShell";

type State = "idle" | "submitting" | "sent";

export function ForgotPasswordClient() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
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
      <AuthShell
        title="Check your inbox"
        description="If an account exists for that address, its reset link will arrive shortly and remain valid for 60 minutes."
      >
        <p className="text-sm text-muted-foreground">
          Check your spam folder if the message does not appear within a few minutes.
        </p>
        <Link className={`${authPrimaryButtonClass} mt-6`} href="/login">
          Return to login
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Enter the email address for your BehalfID account. We’ll send reset instructions when the account is eligible."
      footer={
        <AuthFooterLinks className="text-center">
          Remembered it?{" "}
          <Link className="text-primary hover:underline" href="/login">
            Return to login
          </Link>
        </AuthFooterLinks>
      }
    >
      <form className="space-y-4" onSubmit={submit} aria-busy={state === "submitting"}>
        <AuthField htmlFor="recovery-email" label="Email">
          <input
            autoComplete="email"
            className={authInputClass}
            id="recovery-email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </AuthField>
        <button className={authPrimaryButtonClass} disabled={state === "submitting"} type="submit">
          {state === "submitting" ? "Sending reset link…" : "Send reset link"}
        </button>
      </form>
    </AuthShell>
  );
}
