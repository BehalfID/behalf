"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { FormAlert } from "@/components/auth/AuthShell";
import {
  AuthField,
  AuthFooterLinks,
  AuthProductPanel,
  AuthShell,
  authInputClass,
  authPrimaryButtonClass
} from "@/components/auth/lovable/AuthShell";
import { assignOwnedLocation } from "@/lib/subdomainRouting";

function maxDateOfBirth(minAge: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - minAge);
  return d.toISOString().split("T")[0];
}

function safeNextPath(next?: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  github: "GitHub"
};

/** Only providers with a matching completion route may be addressed by query. */
function safeProvider(raw: string | null): "google" | "github" {
  return raw === "github" ? "github" : "google";
}

export function CompleteProfilePage() {
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const provider = safeProvider(searchParams.get("provider"));
  const providerLabel = PROVIDER_LABELS[provider];
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
      const response = await fetch(`/api/auth/${provider}/complete`, {
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
      assignOwnedLocation(body?.redirectTo ?? "/onboarding");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Confirm your age"
      description="One more step before we create your workspace. We need your date of birth to meet age requirements."
      panel={
        <AuthProductPanel
          title="Almost ready."
          description={`Confirm your age to finish creating your BehalfID workspace after ${providerLabel} authentication.`}
          points={[
            `Verified email taken from your ${providerLabel} account`,
            "Age check required for COPPA compliance",
            "Workspace onboarding comes next"
          ]}
        />
      }
      footer={
        <AuthFooterLinks className="text-center">
          <Link className="text-primary hover:underline" href="/login">
            Back to sign in
          </Link>
        </AuthFooterLinks>
      }
    >
      <form onSubmit={submit} aria-busy={submitting}>
        <AuthField htmlFor="complete-date-of-birth" label="Date of birth">
          <input
            aria-describedby={error ? "complete-profile-error" : undefined}
            autoComplete="bday"
            className={authInputClass}
            id="complete-date-of-birth"
            max={maxDateOfBirth(13)}
            onChange={(event) => setDateOfBirth(event.target.value)}
            required
            type="date"
            value={dateOfBirth}
          />
        </AuthField>
        {error ? (
          <div className="mt-4">
            <FormAlert id="complete-profile-error">{error}</FormAlert>
          </div>
        ) : null}
        <button className={`${authPrimaryButtonClass} mt-5`} disabled={submitting} type="submit">
          {submitting ? "Creating account…" : "Continue"}
        </button>
      </form>
    </AuthShell>
  );
}
