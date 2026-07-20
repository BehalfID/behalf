"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthPrinciple, AuthShell, AuthTaskHeader, FormAlert } from "@/components/auth/AuthShell";
import { Button, Field, FieldLabel, Input } from "@/components/ui";

function maxDateOfBirth(minAge: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - minAge);
  return d.toISOString().split("T")[0];
}

function safeNextPath(next?: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export function CompleteProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

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

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/google/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateOfBirth, next: nextPath ?? undefined })
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        redirectTo?: string;
      } | null;
      if (!response.ok) {
        setError(body?.error ?? "Unable to complete account setup.");
        return;
      }
      router.push(body?.redirectTo ?? "/onboarding");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      compact
      support={
        <AuthPrinciple
          eyebrow="Google sign-up"
          title="Almost ready."
          description="Confirm your age to finish creating your BehalfID workspace after Google authentication."
          points={[
            { label: "Verified email", value: "Taken from your Google account" },
            { label: "Age check", value: "Required for COPPA compliance" },
            { label: "Next", value: "Workspace onboarding" }
          ]}
        />
      }
    >
      <form className="auth-task" onSubmit={submit} aria-busy={submitting}>
        <AuthTaskHeader
          eyebrow="Finish Google sign-up"
          title="Confirm your age"
          description="One more step before we create your workspace. We need your date of birth to meet age requirements."
        />
        <div className="auth-task__fields">
          <Field>
            <FieldLabel htmlFor="complete-date-of-birth">Date of birth</FieldLabel>
            <Input
              aria-describedby={error ? "complete-profile-error" : undefined}
              autoComplete="bday"
              id="complete-date-of-birth"
              max={maxDateOfBirth(13)}
              onChange={(event) => setDateOfBirth(event.target.value)}
              required
              type="date"
              value={dateOfBirth}
            />
          </Field>
        </div>
        {error ? <FormAlert id="complete-profile-error">{error}</FormAlert> : null}
        <Button disabled={submitting} loading={submitting} type="submit" variant="primary">
          {submitting ? "Creating account…" : "Continue"}
        </Button>
        <p className="auth-task__row auth-task__row--center">
          <Link href="/login">Back to sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
