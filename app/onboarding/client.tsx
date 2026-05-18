"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Step = "hello" | "role" | "goal" | "plan";
type Phase = "enter" | "exit";
type Role = "personal" | "website" | "sdk";
type Goal = "block" | "audit" | "limits";

const roles: Array<{ value: Role; label: string; desc: string }> = [
  {
    value: "personal",
    label: "Existing AI assistant user",
    desc: "Create a permission passport for ChatGPT, Claude, Gemini, Zapier, or Make.",
  },
  {
    value: "website",
    label: "Website or app owner",
    desc: "Track AI crawler access, prepare Site Guard rules, and review agent-facing controls.",
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

const plans = [
  {
    value: "free",
    label: "Free",
    price: "$0",
    period: "/ mo",
    features: ["5 agents", "50k verifications / mo", "30-day audit log", "Signed webhooks"],
    cta: "Continue with Free",
    available: true,
  },
  {
    value: "pro",
    label: "Pro",
    price: "$29",
    period: "/ mo",
    features: ["Unlimited agents", "5M verifications / mo", "1-year audit log", "Priority support"],
    cta: "Coming soon",
    available: false,
  },
];

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

  async function pickPlan() {
    setSaving(true);
    try {
      await fetch("/api/auth/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingUseCase: role ?? "sdk" }),
      });
    } catch {
      // best-effort — dashboard still loads without it
    }
    router.push("/dashboard");
  }

  const cls = (base: string) => `${base} ${base}--${phase}`;

  if (step === "hello") {
    return (
      <main className="ob-page ob-page--dark">
        <div className={cls("ob-hello-wrap")}>
          <p className="ob-hello">Hello <span className="ob-wave">👋</span></p>
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
      <div className={cls("ob-step")}>
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
              onClick={p.available ? () => pickPlan() : undefined}
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
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <span className={`ob-plan__cta${!p.available ? " ob-plan__cta--muted" : ""}`}>
                {saving && p.value === "free" ? "Setting up…" : p.cta}
              </span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
