"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthShell, AuthStateMark, AuthTaskHeader, FormAlert } from "@/components/auth/AuthShell";
import { Button, ButtonLink, Field, FieldDescription, FieldLabel, Input } from "@/components/ui";

type State = "idle" | "submitting" | "success" | "error";

export function ResetPasswordClient({ token }: { token?: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");

  if (!token) {
    return (
      <AuthShell compact returnHref="/login" returnLabel="Back to login">
        <section className="auth-task">
          <AuthStateMark tone="error" />
          <AuthTaskHeader
            eyebrow="Password reset"
            title="This reset link is invalid"
            description="The link is missing or malformed. Request a new reset message to continue."
          />
          <ButtonLink href="/forgot-password" variant="primary">Request a new link</ButtonLink>
        </section>
      </AuthShell>
    );
  }

  if (state === "success") {
    return (
      <AuthShell compact returnHref="/login" returnLabel="Back to login">
        <section className="auth-task">
          <AuthStateMark tone="success" />
          <AuthTaskHeader
            eyebrow="Password reset complete"
            title="Your password has been updated"
            description="All previous sessions have been invalidated. Sign in again with your new password."
          />
          <ButtonLink href="/login" variant="primary">Sign in</ButtonLink>
        </section>
      </AuthShell>
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
        setError(body?.error ?? "Password reset failed. The link may have expired.");
        setState("error");
      }
    } catch {
      setError("Network error. Please try again.");
      setState("error");
    }
  };

  return (
    <AuthShell compact returnHref="/login" returnLabel="Back to login">
      <form className="auth-task" onSubmit={submit} aria-busy={state === "submitting"}>
        <AuthTaskHeader
          eyebrow="Account security"
          title="Set a new password"
          description="Choose a new password for your BehalfID account. After this change, you’ll sign in again on every device."
        />
        <div className="auth-task__fields">
          <Field>
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <Input
              aria-describedby="new-password-help"
              autoComplete="new-password"
              id="new-password"
              minLength={10}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            <FieldDescription id="new-password-help">Use at least 10 characters.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
            <Input
              aria-describedby={error ? "password-reset-error" : undefined}
              autoComplete="new-password"
              id="confirm-password"
              minLength={10}
              onChange={(event) => setConfirm(event.target.value)}
              required
              type="password"
              value={confirm}
            />
          </Field>
        </div>
        {error ? <FormAlert id="password-reset-error">{error}</FormAlert> : null}
        <Button loading={state === "submitting"} variant="primary" type="submit">
          {state === "submitting" ? "Updating password…" : "Set new password"}
        </Button>
        <p className="auth-task__row auth-task__row--center">
          <Link href="/login">Back to login</Link>
        </p>
      </form>
    </AuthShell>
  );
}
