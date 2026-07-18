"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button, Logo } from "@/components/ui";

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
    <main id="main-content" className="auth-page" tabIndex={-1}>
      <section className="auth-shell">
        <form className="auth-panel" onSubmit={submit}>
          <Logo />
          <p className="section-kicker">Finish Google sign-up</p>
          <h1>Confirm your age</h1>
          <p>One more step before we create your workspace. We need your date of birth to meet age requirements.</p>
          <label>
            <span>Date of birth</span>
            <input
              autoComplete="bday"
              max={maxDateOfBirth(13)}
              onChange={(event) => setDateOfBirth(event.target.value)}
              required
              type="date"
              value={dateOfBirth}
            />
          </label>
          {error ? <p className="form-error" role="alert" aria-live="assertive">{error}</p> : null}
          <Button disabled={submitting} type="submit" variant="primary">
            {submitting ? "Creating account…" : "Continue"}
          </Button>
          <p className="auth-alt">
            <Link href="/login">Back to sign in</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
