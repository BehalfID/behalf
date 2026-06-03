"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Button, Logo } from "@/components/ui";

function maxDateOfBirth(minAge: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - minAge);
  return d.toISOString().split("T")[0];
}

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [error, setError] = useState("");

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
    router.push(mode === "signup" ? "/verify-email" : "/dashboard");
  };

  return (
    <main id="main-content" className="auth-page" tabIndex={-1}>
      <section className="auth-shell">
        <div className="auth-context">
          <Logo />
          <div>
            <p className="section-kicker">{t("contextKicker")}</p>
            <h2>{t("contextHeading")}</h2>
            <p>{t("contextBody")}</p>
          </div>
          <ul>
            <li>{t("feature1")}</li>
            <li>{t("feature2")}</li>
            <li>{t("feature3")}</li>
            <li>{t("feature4")}</li>
          </ul>
        </div>
        <form className="auth-panel" onSubmit={submit}>
          <p className="section-kicker">{mode === "signup" ? t("signupKicker") : t("loginKicker")}</p>
          <h1>{mode === "signup" ? t("signupH1") : t("loginH1")}</h1>
          <p>{mode === "signup" ? t("signupBody") : t("loginBody")}</p>
          <label>
            <span>{t("emailLabel")}</span>
            <input autoComplete="email" onChange={(e) => setEmail(e.target.value)} required type="email" value={email} />
          </label>
          <label>
            <span>{t("passwordLabel")}</span>
            <input autoComplete={mode === "signup" ? "new-password" : "current-password"} onChange={(e) => setPassword(e.target.value)} required type="password" value={password} />
          </label>
          {mode === "signup" && (
            <label>
              <span>{t("dobLabel")}</span>
              <input
                max={maxDateOfBirth(13)}
                onChange={(e) => setDateOfBirth(e.target.value)}
                required
                type="date"
                value={dateOfBirth}
              />
            </label>
          )}
          {error && <p className="auth-error" role="alert">{error}</p>}
          {mode === "login" && (
            <p className="auth-alt">
              <Link href="/forgot-password">{t("forgotPassword")}</Link>
            </p>
          )}
          <Button type="submit" variant="primary">
            {mode === "signup" ? t("createAccount") : t("logIn")}
          </Button>
          {mode === "signup" && (
            <p className="auth-agree">
              {t("agreePrefix")}
              <Link href="/terms">{t("terms")}</Link>
              {t("and")}
              <Link href="/privacy">{t("privacy")}</Link>
              {t("agreeSuffix")}
            </p>
          )}
          <p className="auth-switch">
            {mode === "signup"
              ? <>{t("haveAccount")}<Link href="/login">{t("signIn")}</Link></>
              : <>{t("noAccount")}<Link href="/signup">{t("signUp")}</Link></>
            }
          </p>
        </form>
      </section>
    </main>
  );
}
