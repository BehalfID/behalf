"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Step = "hello" | "role" | "goal" | "plan";
type Phase = "enter" | "exit";
type Role = "personal" | "website" | "sdk";
type Goal = "block" | "audit" | "limits";
type FeatureKind = "check" | "up" | "new";
type Feature = { text: string; kind: FeatureKind; from?: string };

const roles: Array<{ value: Role; label: string; desc: string }> = [
  {
    value: "personal",
    label: "Existing AI assistant user",
    desc: "Define what an existing AI assistant is permitted to do and share it as a manual permission guide.",
  },
  {
    value: "website",
    label: "Website or app owner",
    desc: "Model which agent actions your site should allow, deny, or require approval for.",
  },
  {
    value: "sdk",
    label: "SDK or API developer",
    desc: "Create an agent identity, define permission boundaries, call verify(), and inspect audit logs.",
  },
];

const goals: Array<{ value: Goal; label: string; desc: string }> = [
  {
    value: "block",
    label: "Block unsafe actions",
    desc: "Stop risky tool calls before they execute — fail closed on denied decisions.",
  },
  {
    value: "audit",
    label: "Track AI activity",
    desc: "Audit every agent decision and action with signed, immutable event logs.",
  },
  {
    value: "limits",
    label: "Enforce spending limits",
    desc: "Cap what agents can spend, approve purchases, and set per-vendor restrictions.",
  },
];

type Plan = {
  value: string;
  label: string;
  price: string;
  period: string;
  features: Feature[];
  cta: string;
  available: boolean;
};

const plans: Plan[] = [
  {
    value: "free",
    label: "Free",
    price: "$0",
    period: "/ mo",
    features: [
      { text: "5 agents", kind: "check" },
      { text: "50k verifications / mo", kind: "check" },
      { text: "30-day audit log", kind: "check" },
      { text: "Signed webhooks", kind: "check" },
      { text: "Community support", kind: "check" },
    ],
    cta: "Continue with Free",
    available: true,
  },
  {
    value: "pro",
    label: "Pro",
    price: "$29",
    period: "/ mo",
    features: [
      { text: "Up to 50 agents", kind: "up", from: "5 on Free" },
      { text: "250,000 verifications / mo", kind: "up", from: "10k on Free" },
      { text: "90-day audit log", kind: "up", from: "7 days on Free" },
      { text: "Signed webhooks", kind: "check" },
      { text: "Priority support + SLA", kind: "new" },
    ],
    cta: "Start free trial",
    available: true,
  },
];

const FEATURE_ICONS: Record<FeatureKind, string> = {
  check: "✓",
  up: "↑",
  new: "+",
};

const TRANSITION_MS = 300;

export function OnboardingClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("hello");
  const [phase, setPhase] = useState<Phase>("enter");
  const [role, setRole] = useState<Role | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (step !== "hello") return;
    const t = setTimeout(() => advance("role"), 2400);
    return () => clearTimeout(t);
  }, [step]);

  function advance(next: Step) {
    setPhase("exit");
    setTimeout(() => {
      setStep(next);
      setPhase("enter");
    }, TRANSITION_MS);
  }

  function pickRole(r: Role) {
    setRole(r);
    advance("goal");
  }

  function pickGoal() {
    advance("plan");
  }

  async function pickPlan(plan: "free" | "pro") {
    setSaving(true);
    try {
      await fetch("/api/auth/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingUseCase: role ?? "sdk" }),
      });
    } catch {
      // best-effort — dashboard loads regardless
    }
    if (plan === "pro") {
      try {
        const res = await fetch("/api/billing/checkout", { method: "POST" });
        const data = await res.json();
        if (res.ok && data.url) {
          window.location.href = data.url;
          return;
        }
      } catch {
        // fall through to dashboard if checkout fails
      }
    }
    router.push("/dashboard");
  }

  const cls = (base: string) => `${base} ${base}--${phase}`;

  if (step === "hello") {
    const letters = "Hello ".split("");
    return (
      <main id="main-content" className="ob-page ob-page--dark" tabIndex={-1}>
        <div className={cls("ob-hello-wrap")}>
          <p className="ob-hello" aria-label="Hello 👋">
            {letters.map((ch, i) => (
              <span
                aria-hidden="true"
                className="ob-char"
                key={i}
                style={{ animationDelay: `${i * 13}ms` }}
              >
                {ch === " " ? " " : ch}
              </span>
            ))}
            {/* emoji: ob-char entry wraps ob-wave rotation */}
            <span
              aria-hidden="true"
              className="ob-char"
              style={{ animationDelay: `${letters.length * 13}ms` }}
            >
              <span className="ob-wave">👋</span>
            </span>
          </p>
        </div>
      </main>
    );
  }

  if (step === "role") {
    return (
      <main className="ob-page">
        <div className={cls("ob-step")}>
          <p className="ob-kicker">Step 1 of 3</p>
          <h1 className="ob-heading">Which best describes you?</h1>
          <div className="ob-choices">
            {roles.map((r) => (
              <button
                className={`ob-choice${role === r.value ? " ob-choice--active" : ""}`}
                key={r.value}
                onClick={() => pickRole(r.value)}
                type="button"
              >
                <strong>{r.label}</strong>
                <span>{r.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (step === "goal") {
    return (
      <main className="ob-page">
        <div className={cls("ob-step")}>
          <p className="ob-kicker">Step 2 of 3</p>
          <h1 className="ob-heading">What&apos;s your first priority?</h1>
          <div className="ob-choices">
            {goals.map((g) => (
              <button
                className="ob-choice"
                key={g.value}
                onClick={() => pickGoal()}
                type="button"
              >
                <strong>{g.label}</strong>
                <span>{g.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="ob-page">
      <div className={`${cls("ob-step")} ob-step--wide`}>
        <p className="ob-kicker">Step 3 of 3</p>
        <h1 className="ob-heading">Choose your plan.</h1>
        <p className="ob-sub">Start free. Upgrade when you need more.</p>
        <div className="ob-plans">
          {plans.map((p) => (
            <button
              className={[
                "ob-plan",
                p.value === "free" ? "ob-plan--featured" : "",
                !p.available ? "ob-plan--disabled" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={!p.available || saving}
              key={p.value}
              onClick={p.available ? () => pickPlan(p.value as "free" | "pro") : undefined}
              type="button"
            >
              {!p.available && <span className="ob-plan__badge">Coming soon</span>}
              <div className="ob-plan__header">
                <strong>{p.label}</strong>
                <span className="ob-plan__price">
                  {p.price}
                  <small>{p.period}</small>
                </span>
              </div>
              <ul className="ob-plan__features">
                {p.features.map((f) => (
                  <li key={f.text}>
                    <em className={`ob-plan__feat-icon${f.kind !== "check" ? ` ob-plan__feat-icon--${f.kind}` : ""}`}>
                      {FEATURE_ICONS[f.kind]}
                    </em>
                    <span className="ob-plan__feat-body">
                      {f.text}
                      {f.from && <span className="ob-plan__feat-from">up from {f.from}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <span className={`ob-plan__cta${!p.available ? " ob-plan__cta--muted" : ""}`}>
                {saving ? "Setting up…" : p.cta}
              </span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
