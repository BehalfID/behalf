"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { ContinueWithGitHub } from "@/components/auth/ContinueWithGitHub";
import { ContinueWithGoogle } from "@/components/auth/ContinueWithGoogle";
import { ContinueWithPasskey } from "@/components/auth/ContinueWithPasskey";
import { FormAlert } from "@/components/auth/AuthShell";
import {
  AuthDivider,
  AuthField,
  AuthFooterLinks,
  AuthProductPanel,
  AuthShell,
  authInputClass,
  authOAuthButtonClass,
  authPrimaryButtonClass
} from "@/components/auth/lovable/AuthShell";
import { oauthErrorMessage } from "@/lib/authProviders/oauthErrors";
import { assignOwnedLocation } from "@/lib/subdomainRouting";

function maxDateOfBirth(minAge: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - minAge);
  return d.toISOString().split("T")[0];
}

export function AuthPage({
  mode,
  googleEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID),
  githubEnabled = false,
  passkeyEnabled = false
}: {
  mode: "login" | "signup";
  googleEnabled?: boolean;
  githubEnabled?: boolean;
  passkeyEnabled?: boolean;
}) {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const oauthError = useMemo(() => {
    const code = searchParams.get("oauth_error")?.trim();
    if (code) return oauthErrorMessage(code);
    return searchParams.get("error")?.trim() || "";
  }, [searchParams]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [error, setError] = useState(oauthError);
  const [submitting, setSubmitting] = useState(false);
  const showOauth = googleEnabled || githubEnabled;
  const showPasskey = mode === "login" && passkeyEnabled;

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
      assignOwnedLocation(mode === "signup" ? "/onboarding" : "/dashboard");
    } catch {
      setError(t("authFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title={mode === "signup" ? t("signupH1") : t("loginH1")}
      description={mode === "signup" ? t("signupBody") : t("loginBody")}
      panel={
        <AuthProductPanel
          title={t("contextHeading")}
          description={t("contextBody")}
          points={[t("feature1"), t("feature2"), t("feature4")]}
        />
      }
      footer={
        <AuthFooterLinks className="text-center">
          {mode === "signup" ? (
            <>
              {t("haveAccount")}
              <Link className="text-primary hover:underline" href="/login">
                {t("signIn")}
              </Link>
            </>
          ) : (
            <>
              {t("noAccount")}
              <Link className="text-primary hover:underline" href="/signup">
                {t("signUp")}
              </Link>
            </>
          )}
        </AuthFooterLinks>
      }
    >
      <form onSubmit={submit} aria-busy={submitting}>
        {/* Login order: passkey, GitHub, Google, divider, credentials. */}
        {showOauth || showPasskey ? (
          <>
            <div className="space-y-2.5">
              {showPasskey ? (
                <ContinueWithPasskey enabled stackClassName="space-y-2" buttonClassName={authOAuthButtonClass} />
              ) : null}
              {githubEnabled ? (
                <ContinueWithGitHub
                  label={t("continueWithGitHub")}
                  mode={mode}
                  unstyled
                  className={authOAuthButtonClass}
                />
              ) : null}
              {googleEnabled ? (
                <ContinueWithGoogle
                  label={t("continueWithGoogle")}
                  mode={mode}
                  unstyled
                  className={authOAuthButtonClass}
                />
              ) : null}
            </div>
            <AuthDivider label={t("orDivider")} />
          </>
        ) : null}

        <div className="space-y-4">
          <AuthField htmlFor="auth-email" label={t("emailLabel")}>
            <input
              aria-describedby={error ? "auth-submit-error" : undefined}
              autoComplete="email"
              className={authInputClass}
              id="auth-email"
              onChange={(e) => setEmail(e.target.value)}
              required
              type="email"
              value={email}
            />
          </AuthField>
          <AuthField htmlFor="auth-password" label={t("passwordLabel")}>
            <input
              aria-describedby={error ? "auth-submit-error" : undefined}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className={authInputClass}
              id="auth-password"
              onChange={(e) => setPassword(e.target.value)}
              required
              type="password"
              value={password}
            />
          </AuthField>
          {mode === "signup" && (
            <AuthField htmlFor="auth-date-of-birth" label={t("dobLabel")}>
              <input
                aria-describedby={error ? "auth-submit-error" : undefined}
                className={authInputClass}
                id="auth-date-of-birth"
                max={maxDateOfBirth(13)}
                onChange={(e) => setDateOfBirth(e.target.value)}
                required
                type="date"
                value={dateOfBirth}
              />
            </AuthField>
          )}
        </div>

        {error ? (
          <div className="mt-4">
            <FormAlert id="auth-submit-error">{error}</FormAlert>
          </div>
        ) : null}

        {mode === "login" ? (
          <p className="mt-3 text-right text-sm">
            <Link className="text-muted-foreground hover:text-foreground" href="/forgot-password">
              {t("forgotPassword")}
            </Link>
          </p>
        ) : null}

        <button className={`${authPrimaryButtonClass} mt-5`} disabled={submitting} type="submit">
          {mode === "signup" ? t("createAccount") : t("logIn")}
        </button>

        {mode === "signup" ? (
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            {t("agreePrefix")}
            <Link className="text-primary hover:underline" href="/terms">
              {t("terms")}
            </Link>
            {t("and")}
            <Link className="text-primary hover:underline" href="/privacy">
              {t("privacy")}
            </Link>
            {t("agreeSuffix")}
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}
