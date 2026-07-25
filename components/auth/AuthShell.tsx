"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Logo, LanguageSwitcher, ThemeToggle } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { crossAppClickHandler, isLocaleAwarePublicPath } from "@/lib/subdomainRouting";

type AuthShellProps = {
  children: ReactNode;
  support?: ReactNode;
  returnHref?: string;
  returnLabel?: string;
  footerLabel?: string;
  privacyLabel?: string;
  termsLabel?: string;
  compact?: boolean;
};

export function AuthShell({
  children,
  support,
  returnHref = "/",
  returnLabel = "Back to BehalfID",
  footerLabel = "Secure account entry",
  privacyLabel = "Privacy",
  termsLabel = "Terms",
  compact = false
}: AuthShellProps) {
  const pathname = usePathname() || "/";
  const showLanguageSwitcher = isLocaleAwarePublicPath(pathname);

  return (
    <main
      id="main-content"
      className={`auth-entry${compact ? " auth-entry--compact" : ""}`}
      tabIndex={-1}
    >
      <header className="auth-entry__header">
        <Logo href={returnHref} markStyle="framed" />
        <div className="auth-entry__header-actions">
          {showLanguageSwitcher ? <LanguageSwitcher /> : null}
          <ThemeToggle />
          <Link className="auth-entry__return" href={returnHref} onClick={crossAppClickHandler(returnHref)}>
            <span aria-hidden="true">←</span>
            {returnLabel}
          </Link>
        </div>
      </header>

      <div className="auth-entry__body">
        {support ? <aside className="auth-entry__support">{support}</aside> : null}
        <div className="auth-entry__task-wrap">{children}</div>
      </div>

      <footer className="auth-entry__footer">
        <span>{footerLabel}</span>
        <span aria-hidden="true">·</span>
        <Link href="/privacy" onClick={crossAppClickHandler("/privacy")}>
          {privacyLabel}
        </Link>
        <Link href="/terms" onClick={crossAppClickHandler("/terms")}>
          {termsLabel}
        </Link>
      </footer>
    </main>
  );
}

export function AuthPrinciple({
  eyebrow,
  title,
  description,
  points = []
}: {
  eyebrow: string;
  title: string;
  description: string;
  points?: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="auth-principle">
      <p className="auth-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{description}</p>
      {points.length ? (
        <dl className="auth-principle__points">
          {points.map((point) => (
            <div key={point.label}>
              <dt>{point.label}</dt>
              <dd>{point.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

export function AuthTask({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={["auth-task", className].filter(Boolean).join(" ")}>{children}</section>;
}

export function AuthTaskHeader({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
}) {
  return (
    <header className="auth-task__header">
      <p className="auth-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </header>
  );
}

export function FormAlert({
  children,
  tone = "error",
  id
}: {
  children: ReactNode;
  tone?: "error" | "success" | "notice";
  id?: string;
}) {
  return (
    <div
      className={`auth-alert auth-alert--${tone}`}
      id={id}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      <span className="auth-alert__mark" aria-hidden="true">
        {tone === "success" ? "✓" : tone === "notice" ? "i" : "!"}
      </span>
      <div>{children}</div>
    </div>
  );
}

export function AuthStateMark({ tone }: { tone: "success" | "error" | "pending" | "notice" }) {
  return (
    <span className={`auth-state-mark auth-state-mark--${tone}`} aria-hidden="true">
      {tone === "success" ? "✓" : tone === "error" ? "!" : tone === "pending" ? "···" : "i"}
    </span>
  );
}
