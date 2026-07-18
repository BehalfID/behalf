"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthShell, AuthStateMark, AuthTaskHeader } from "@/components/auth/AuthShell";
import { Button, ButtonLink, Field, FieldLabel, Input } from "@/components/ui";

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
      <AuthShell compact returnHref="/login" returnLabel="Back to login">
        <section className="auth-task">
          <AuthStateMark tone="success" />
          <AuthTaskHeader
            eyebrow="Reset request received"
            title="Check your inbox"
            description="If an account exists for that address, its reset link will arrive shortly and remain valid for 60 minutes."
          />
          <p className="auth-task__meta">Check your spam folder if the message does not appear within a few minutes.</p>
          <ButtonLink href="/login" variant="primary">Return to login</ButtonLink>
        </section>
      </AuthShell>
    );
  }

  return (
    <AuthShell compact returnHref="/login" returnLabel="Back to login">
      <form className="auth-task" onSubmit={submit} aria-busy={state === "submitting"}>
        <AuthTaskHeader
          eyebrow="Account recovery"
          title="Reset your password"
          description="Enter the email address for your BehalfID account. We’ll send reset instructions when the account is eligible."
        />
        <Field>
          <FieldLabel htmlFor="recovery-email">Email</FieldLabel>
          <Input
            autoComplete="email"
            id="recovery-email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </Field>
        <Button loading={state === "submitting"} variant="primary" type="submit">
          {state === "submitting" ? "Sending reset link…" : "Send reset link"}
        </Button>
        <p className="auth-task__row auth-task__row--center">
          Remembered it? <Link href="/login">Return to login</Link>
        </p>
      </form>
    </AuthShell>
  );
}
