"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { FormAlert } from "@/components/auth/AuthShell";
import {
  AuthField,
  AuthFooterLinks,
  AuthShell,
  authInputClass,
  authPrimaryButtonClass
} from "@/components/auth/lovable/AuthShell";

type State = "idle" | "submitting" | "success" | "error";

export function ResetPasswordClient({ token }: { token?: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");

  if (!token) {
    return (
      <AuthShell
        title="This reset link is invalid"
        description="The link is missing or malformed. Request a new reset message to continue."
      >
        <Link className={authPrimaryButtonClass} href="/forgot-password">
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  if (state === "success") {
    return (
      <AuthShell
        title="Your password has been updated"
        description="All previous sessions have been invalidated. Sign in again with your new password."
      >
        <Link className={authPrimaryButtonClass} href="/login">
          Sign in
        </Link>
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
    <AuthShell
      title="Set a new password"
      description="Choose a new password for your BehalfID account. After this change, you’ll sign in again on every device."
      footer={
        <AuthFooterLinks className="text-center">
          <Link className="text-primary hover:underline" href="/login">
            Back to login
          </Link>
        </AuthFooterLinks>
      }
    >
      <form onSubmit={submit} aria-busy={state === "submitting"}>
        <div className="space-y-4">
          <AuthField htmlFor="new-password" label="New password" hint="Use at least 10 characters.">
            <input
              aria-describedby="new-password-help"
              autoComplete="new-password"
              className={authInputClass}
              id="new-password"
              minLength={10}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </AuthField>
          <AuthField htmlFor="confirm-password" label="Confirm password">
            <input
              aria-describedby={error ? "password-reset-error" : undefined}
              autoComplete="new-password"
              className={authInputClass}
              id="confirm-password"
              minLength={10}
              onChange={(event) => setConfirm(event.target.value)}
              required
              type="password"
              value={confirm}
            />
          </AuthField>
        </div>
        {error ? (
          <div className="mt-4">
            <FormAlert id="password-reset-error">{error}</FormAlert>
          </div>
        ) : null}
        <button className={`${authPrimaryButtonClass} mt-5`} disabled={state === "submitting"} type="submit">
          {state === "submitting" ? "Updating password…" : "Set new password"}
        </button>
      </form>
    </AuthShell>
  );
}
