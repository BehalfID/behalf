"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthPrinciple, AuthShell, AuthTaskHeader, FormAlert } from "@/components/auth/AuthShell";
import { Button, Field, FieldLabel, Input } from "@/components/ui";

/** Returns the latest date of birth that satisfies the minimum age (YYYY-MM-DD). */
function maxDateOfBirth(minAge: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - minAge);
  return d.toISOString().split("T")[0];
}

function safeNextPath(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export function AuthPage({
  mode,
  nextPath,
  initialEmail = ""
}: {
  mode: "login" | "signup";
  nextPath?: string;
  initialEmail?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [error, setError] = useState("");
  const redirectPath = safeNextPath(nextPath) ?? (mode === "signup" ? "/verify-email" : "/dashboard");
  const [submitting, setSubmitting] = useState(false);


  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (mode === "signup") {
      if (!dateOfBirth) {
        setError("Date of birth is required.");
        return;
      }
      const dob = new Date(dateOfBirth);
      const ageLimitDate = new Date();
      ageLimitDate.setFullYear(ageLimitDate.getFullYear() - 13);
      if (dob > ageLimitDate) {
        setError("You must be at least 13 years old to create an account.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { email, password, dateOfBirth } : { email, password })
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Authentication failed.");
        return;
      }

      const body = (await response.json().catch(() => null)) as {
        user?: { emailVerified?: boolean };
      } | null;

      if (mode === "signup" || body?.user?.emailVerified === false) {
        router.push("/verify-email");
        return;
      }

      router.push(redirectPath);
    } catch {
      setError("We could not reach BehalfID. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      support={
        <AuthPrinciple
          eyebrow="Authorization control plane"
          title="Every agent starts with an identity."
          description="BehalfID checks an agent’s requested action against workspace policy before it runs, then records the decision."
          points={[
            { label: "Identity", value: "One accountable identity per agent" },
            { label: "Policy", value: "Scoped permissions and approval gates" },
            { label: "Record", value: "A durable decision trail" }
          ]}
        />
      }
    >
      <form className="auth-task" onSubmit={submit} aria-busy={submitting}>
        <AuthTaskHeader
          eyebrow={mode === "signup" ? "New workspace" : "Control plane access"}
          title={mode === "signup" ? "Create your workspace" : "Sign in"}
          description={mode === "signup"
            ? "Create the account you’ll use to register agents and set their operating boundaries."
            : "Enter the account credentials for your BehalfID control plane."}
        />

        <div className="auth-task__fields">
          <Field>
            <FieldLabel htmlFor="auth-email">Email</FieldLabel>
            <Input
              aria-describedby={error ? "auth-submit-error" : undefined}
              autoComplete="email"
              id="auth-email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="auth-password">Password</FieldLabel>
            <Input
              aria-describedby={error ? "auth-submit-error" : undefined}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              id="auth-password"
              minLength={10}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </Field>
          {mode === "signup" && (
            <Field>
              <FieldLabel htmlFor="auth-date-of-birth">Date of birth</FieldLabel>
              <Input
                aria-describedby={error ? "auth-submit-error" : undefined}
                autoComplete="bday"
                id="auth-date-of-birth"
                max={maxDateOfBirth(13)}
                onChange={(event) => setDateOfBirth(event.target.value)}
                required
                type="date"
                value={dateOfBirth}
              />
            </Field>
          )}
        </div>

        {error ? <FormAlert id="auth-submit-error">{error}</FormAlert> : null}

        {mode === "login" ? (
          <p className="auth-task__row">
            <span />
            <Link href="/forgot-password">Forgot password?</Link>
          </p>
        ) : null}

        <Button loading={submitting} variant="primary" type="submit">
          {submitting
            ? mode === "signup" ? "Creating account…" : "Signing in…"
            : mode === "signup" ? "Create account" : "Log in"}
        </Button>

        {mode === "signup" ? (
          <p className="auth-task__legal">
            By creating an account you agree to the{" "}
            <Link href="/terms">Terms of Service</Link> and{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
        ) : null}

        <p className="auth-task__row auth-task__row--center">
          {mode === "signup" ? "Already have an account?" : "New to BehalfID?"}{" "}
          <Link href={mode === "signup" ? `/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}` : `/signup${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}${initialEmail ? `${nextPath ? "&" : "?"}email=${encodeURIComponent(initialEmail)}` : ""}`}>
            {mode === "signup" ? "Log in" : "Create account"}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
