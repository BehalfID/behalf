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
    router.push(mode === "signup" ? "/onboarding" : "/dashboard");
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
          <div className="auth-artifact" aria-hidden="true">
            <div className="auth-artifact__head">
              <p className="cx-label">Verification event</p>
              <span className="auth-artifact__id">evt_01j8j3kf9d</span>
            </div>
            <div className="auth-artifact__body">
              <dl className="cx-record">
                <div className="cx-record__row">
                  <dt>Agent</dt>
                  <dd>deploy-bot</dd>
                </div>
                <div className="cx-record__row">
                  <dt>Action</dt>
                  <dd>github.merge → api-core/main</dd>
                </div>
                <div className="cx-record__row">
                  <dt>Policy</dt>
                  <dd>protected-branches</dd>
                </div>
                <div className="cx-record__row">
                  <dt>Decision</dt>
                  <dd><span className="cx-chip cx-chip--warn">Approval required</span></dd>
                </div>
                <div className="cx-record__row">
                  <dt>Receipt</dt>
                  <dd>signed · sha256 · 41ms</dd>
                </div>
              </dl>
            </div>
            <div className="auth-feed">
              <div className="auth-feed__row">
                <span className="auth-feed__time">14:32</span>
                <span className="auth-feed__desc">ci-runner · deploy.staging</span>
                <span className="cx-chip cx-chip--ok">Allowed</span>
              </div>
              <div className="auth-feed__row">
                <span className="auth-feed__time">14:31</span>
                <span className="auth-feed__desc">cursor-agent · secrets.read .env</span>
                <span className="cx-chip cx-chip--deny">Denied</span>
              </div>
              <div className="auth-feed__row">
                <span className="auth-feed__time">14:29</span>
                <span className="auth-feed__desc">deploy-bot · db.migrate</span>
                <span className="cx-chip cx-chip--warn">Pending</span>
              </div>
            </div>
          </div>
          <div className="auth-meta-row">
            <span>{t("feature1")}</span>
            <span>{t("feature3")}</span>
            <span>{t("feature4")}</span>
          </div>
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
