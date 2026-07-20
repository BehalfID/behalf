"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { ContinueWithGoogle } from "@/components/auth/ContinueWithGoogle";
import { AuthPrinciple, AuthShell, AuthTaskHeader, FormAlert } from "@/components/auth/AuthShell";
import { Button, Field, FieldLabel, Input } from "@/components/ui";

function maxDateOfBirth(minAge: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - minAge);
  return d.toISOString().split("T")[0];
}

export function AuthPage({
  mode,
  googleEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID)
}: {
  mode: "login" | "signup";
  googleEnabled?: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (mode === "signup") {
      if (!dateOfBirth) {
        setError(t("dobRequired"));
        return;
      }
      const dob = new Date(dateOfBirth);
      const ageLimitDate = new Date();
      ageLimitDate.setFullYear(ageLimitDate.getFullYear() - 13);
      if (dob > ageLimitDate) {
        setError(t("ageError"));
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
        setError(body?.error ?? t("authFailed"));
        return;
      }
      router.push(mode === "signup" ? "/onboarding" : "/dashboard");
    } catch {
      setError(t("authFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      footerLabel={t("contextKicker")}
      privacyLabel={t("privacy")}
      returnLabel="BehalfID"
      support={
        <AuthPrinciple
          eyebrow={t("contextKicker")}
          title={t("contextHeading")}
          description={t("contextBody")}
          points={[
            { label: "01", value: t("feature1") },
            { label: "02", value: t("feature2") },
            { label: "03", value: t("feature4") }
          ]}
        />
      }
      termsLabel={t("terms")}
    >
      <form className="auth-task" onSubmit={submit} aria-busy={submitting}>
        <AuthTaskHeader
          eyebrow={mode === "signup" ? t("signupKicker") : t("loginKicker")}
          title={mode === "signup" ? t("signupH1") : t("loginH1")}
          description={mode === "signup" ? t("signupBody") : t("loginBody")}
        />

        {googleEnabled ? (
          <div className="auth-task__oauth">
            <ContinueWithGoogle label={t("continueWithGoogle")} mode={mode} />
            <p className="auth-divider" role="separator">
              <span>{t("orDivider")}</span>
            </p>
          </div>
        ) : null}

        <div className="auth-task__fields">
          <Field>
            <FieldLabel htmlFor="auth-email">{t("emailLabel")}</FieldLabel>
            <Input
              aria-describedby={error ? "auth-submit-error" : undefined}
              autoComplete="email"
              id="auth-email"
              onChange={(e) => setEmail(e.target.value)}
              required
              type="email"
              value={email}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="auth-password">{t("passwordLabel")}</FieldLabel>
            <Input
              aria-describedby={error ? "auth-submit-error" : undefined}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              id="auth-password"
              onChange={(e) => setPassword(e.target.value)}
              required
              type="password"
              value={password}
            />
          </Field>
          {mode === "signup" && (
            <Field>
              <FieldLabel htmlFor="auth-date-of-birth">{t("dobLabel")}</FieldLabel>
              <Input
                aria-describedby={error ? "auth-submit-error" : undefined}
                id="auth-date-of-birth"
                max={maxDateOfBirth(13)}
                onChange={(e) => setDateOfBirth(e.target.value)}
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
            <Link href="/forgot-password">{t("forgotPassword")}</Link>
          </p>
        ) : null}

        <Button loading={submitting} type="submit" variant="primary">
          {mode === "signup" ? t("createAccount") : t("logIn")}
        </Button>

        {mode === "signup" ? (
          <p className="auth-task__legal">
            {t("agreePrefix")}
            <Link href="/terms">{t("terms")}</Link>
            {t("and")}
            <Link href="/privacy">{t("privacy")}</Link>
            {t("agreeSuffix")}
          </p>
        ) : null}

        <p className="auth-task__row auth-task__row--center">
          {mode === "signup"
            ? <>{t("haveAccount")}<Link href="/login">{t("signIn")}</Link></>
            : <>{t("noAccount")}<Link href="/signup">{t("signUp")}</Link></>
          }
        </p>
      </form>
    </AuthShell>
  );
}
