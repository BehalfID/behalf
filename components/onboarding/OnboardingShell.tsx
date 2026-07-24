"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button, Logo, ThemeToggle } from "@/components/ui";
import { crossAppClickHandler } from "@/lib/subdomainRouting";

export type OnboardingStep = {
  label: string;
};

export function OnboardingProgress({
  steps,
  currentStep
}: {
  steps: readonly OnboardingStep[];
  currentStep: number;
}) {
  const activeLabel = steps[currentStep - 1]?.label ?? "Setup";
  const progress = steps.length > 1 ? ((currentStep - 1) / (steps.length - 1)) * 100 : 100;

  return (
    <nav className="journey-progress" aria-label={`Step ${currentStep} of ${steps.length}: ${activeLabel}`}>
      <div className="journey-progress__mobile">
        <span>
          Step {currentStep} of {steps.length}
        </span>
        <strong>{activeLabel}</strong>
      </div>
      <div className="journey-progress__track" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <ol>
        {steps.map((step, index) => {
          const number = index + 1;
          const status = number < currentStep ? "complete" : number === currentStep ? "current" : "upcoming";
          return (
            <li data-status={status} key={`${number}-${step.label}`}>
              <span aria-hidden="true">{number < currentStep ? "✓" : number}</span>
              <strong aria-current={number === currentStep ? "step" : undefined}>{step.label}</strong>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function OnboardingShell({
  children,
  steps,
  currentStep,
  label,
  homeHref = "/",
  exitHref,
  exitLabel,
  embedded = false
}: {
  children: ReactNode;
  steps: readonly OnboardingStep[];
  currentStep: number;
  label: string;
  homeHref?: string;
  exitHref?: string;
  exitLabel?: string;
  embedded?: boolean;
}) {
  const content = (
    <>
      <header className="journey-header">
        <Logo href={homeHref} markStyle="framed" subtitle={label} />
        <div className="journey-header__actions">
          {!embedded ? <ThemeToggle /> : null}
          {exitHref && exitLabel ? (
            <Link className="journey-header__exit" href={exitHref} onClick={crossAppClickHandler(exitHref)}>
              {exitLabel}
            </Link>
          ) : null}
        </div>
      </header>
      <div className="journey-layout">
        <OnboardingProgress currentStep={currentStep} steps={steps} />
        <section className="journey-task">{children}</section>
      </div>
    </>
  );

  if (embedded) {
    return <section className="journey-shell journey-shell--embedded">{content}</section>;
  }

  return (
    <main id="main-content" className="journey-shell" tabIndex={-1}>
      {content}
    </main>
  );
}

export function OnboardingIntro({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description: ReactNode;
}) {
  return (
    <header className="journey-intro">
      <p className="journey-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

export function StepActions({
  onBack,
  onContinue,
  backLabel = "Back",
  continueLabel = "Continue",
  backDisabled,
  continueDisabled,
  loading
}: {
  onBack?: () => void;
  onContinue: () => void;
  backLabel?: string;
  continueLabel?: string;
  backDisabled?: boolean;
  continueDisabled?: boolean;
  loading?: boolean;
}) {
  return (
    <footer className="journey-actions">
      {onBack ? (
        <Button disabled={backDisabled || loading} onClick={onBack} type="button" variant="ghost">
          {backLabel}
        </Button>
      ) : (
        <span aria-hidden="true" />
      )}
      <Button
        disabled={continueDisabled}
        loading={loading}
        onClick={onContinue}
        type="button"
        variant="primary"
      >
        {continueLabel}
      </Button>
    </footer>
  );
}
