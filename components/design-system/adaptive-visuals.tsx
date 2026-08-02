"use client";

import { Check, Eye, Lightbulb, Pause, Play, ShieldCheck } from "./icons";
import { useSequence } from "@/hooks/use-motion";
import { IllustrativeTag } from "@/components/design-system/motion";
import { cn } from "@/lib/cn";

/**
 * Adaptive-engine visuals.
 *
 * Product truth these components must hold to:
 *  - explicit policy stays authoritative,
 *  - learning is gradual and evidence-based,
 *  - a recommendation only affects runtime once an administrator enables it.
 * Every number here is reference content, labelled as illustrative.
 */

type Outcome = "approved" | "declined";

/** Evidence marks that accumulate as the sequence advances. */
const evidence: Outcome[] = [
  "approved", "approved", "declined", "approved", "approved",
  "approved", "approved", "approved", "declined", "approved",
  "approved", "approved", "approved", "approved", "approved",
  "approved", "approved", "approved", "approved", "approved",
];

const stages = [
  {
    label: "Request observed",
    caption: "Release Bot asks to run a production database migration.",
    marks: 1,
    confidence: "Insufficient evidence",
    handling: "Approval required",
  },
  {
    label: "Human approved",
    caption: "A named reviewer approves, and the surrounding context is recorded.",
    marks: 2,
    confidence: "Insufficient evidence",
    handling: "Approval required",
  },
  {
    label: "Pattern emerging",
    caption: "The same request shape keeps reaching the same people with the same answer.",
    marks: 8,
    confidence: "Emerging",
    handling: "Approval still required",
  },
  {
    label: "Recommendation ready",
    caption: "The engine proposes a scoped rule and shows the decisions it is based on.",
    marks: 20,
    confidence: "Consistent",
    handling: "Awaiting administrator review",
  },
  {
    label: "Administrator enables it",
    caption: "The rule takes effect only after a person accepts it — and can be disabled at any time.",
    marks: 20,
    confidence: "Consistent",
    handling: "Scoped rule active",
  },
];

/**
 * Learn-over-time visual: repeated human decisions become evidence, evidence
 * becomes a bounded recommendation, an administrator decides whether it runs.
 */
export function LearningTimeline({ className }: { className?: string }) {
  const { ref, active, select, replay, paused, setPaused, reduced, isPlaying } = useSequence(stages.length, {
    interval: 2600,
    restAtEnd: 4200,
    loop: true,
  });
  const stage = stages[active]!;
  const showRecommendation = active >= 3;
  const enabled = active === 4;

  return (
    <div
      ref={ref}
      className={cn("canvas-frame p-6 sm:p-8 lg:p-10", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="grid ds-grid-fr-auto items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="ds-text-11 font-medium uppercase ds-tracking-0_18 text-muted-foreground">
            Decision history
          </span>
          <IllustrativeTag />
        </div>
        <SequenceControls paused={paused} reduced={reduced} playing={isPlaying} onToggle={() => setPaused((p) => !p)} onReplay={replay} />
      </div>

      {/* accumulating evidence */}
      <div className="mt-7">
        <div className="flex flex-wrap gap-1.5" aria-hidden>
          {evidence.map((o, i) => {
            const on = i < stage.marks;
            return (
              <span
                key={i}
                className={cn(
                  "size-2.5 rounded-full transition-colors duration-500",
                  !on && "bg-border",
                  on && o === "approved" && "bg-success",
                  on && o === "declined" && "bg-destructive/70",
                  on && !reduced && "mark-in",
                )}
                style={on && !reduced ? { animationDelay: `${Math.min(i, 12) * 45}ms` } : undefined}
              />
            );
          })}
        </div>
        <p className="mt-4 ds-text-13 text-muted-foreground">
          <span className="num text-foreground">{stage.marks}</span> similar decisions observed · approvals and
          declines both count as evidence
        </p>
      </div>

      {/* stage rail */}
      <ol className="mt-8 grid gap-1.5 sm:grid-cols-5 sm:gap-3">
        {stages.map((s, i) => (
          <li key={s.label}>
            <button
              type="button"
              onClick={() => select(i)}
              aria-current={i === active}
              className="group w-full rounded-lg py-2 text-left transition-colors"
            >
              <span
                className={cn(
                  "block ds-h-3px w-full rounded-full transition-colors duration-500",
                  i <= active ? "bg-primary" : "bg-border",
                )}
              />
              <span
                className={cn(
                  "mt-3 block ds-text-13 font-medium transition-colors",
                  i === active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                )}
              >
                {s.label}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-8 lg:ds-grid-asymmetric-c lg:gap-10">
        <div className="min-w-0">
          <p className="ds-text-17 leading-snug tracking-tight sm:ds-text-19">{stage.caption}</p>

          <dl className="mt-7 grid gap-5 sm:grid-cols-3">
            <div>
              <dt className="ds-text-11 font-medium uppercase ds-tracking-0_16 text-muted-foreground">
                Pattern confidence
              </dt>
              <dd className="mt-1.5 ds-text-15 font-medium">{stage.confidence}</dd>
            </div>
            <div>
              <dt className="ds-text-11 font-medium uppercase ds-tracking-0_16 text-muted-foreground">
                Handling today
              </dt>
              <dd className="mt-1.5 ds-text-15 font-medium">{stage.handling}</dd>
            </div>
            <div>
              <dt className="ds-text-11 font-medium uppercase ds-tracking-0_16 text-muted-foreground">Policy</dt>
              <dd className="mt-1.5 ds-text-15 font-medium text-primary">Authoritative</dd>
            </div>
          </dl>
        </div>

        {/* Recommendation panel — empty state until the evidence supports one. */}
        <div className="min-w-0 rounded-xl bg-surface-2 p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Lightbulb
              className={cn("size-4 transition-colors", showRecommendation ? "text-primary" : "text-muted-foreground")}
              aria-hidden
            />
            <span className="ds-text-13 font-medium">Suggested handling</span>
            {showRecommendation ? (
              enabled ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-0.5 ds-text-12 font-medium text-success">
                  <Check className="size-3" aria-hidden /> Enabled
                </span>
              ) : (
                <span className="rounded-full bg-warning-soft px-2.5 py-0.5 ds-text-12 font-medium text-warning">
                  Review required
                </span>
              )
            ) : null}
          </div>

          {showRecommendation ? (
            <>
              <p className="mt-3 ds-text-15 leading-relaxed text-muted-foreground">
                Allow scheduled production migrations from Release Bot inside the deployment window. Everything
                outside that window keeps requiring approval.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 ds-text-13 font-medium transition-colors",
                    enabled ? "bg-success-soft text-success" : "bg-primary text-primary-foreground",
                  )}
                >
                  {enabled ? <Check className="size-3.5" aria-hidden /> : null}
                  {enabled ? "Scoped rule active" : "Review recommendation"}
                </span>
                <span className="inline-flex items-center rounded-lg bg-surface px-3.5 py-2 ds-text-13 font-medium text-muted-foreground">
                  Keep requiring approval
                </span>
              </div>
            </>
          ) : (
            <p className="mt-3 ds-text-15 leading-relaxed text-muted-foreground">
              Not enough comparable decisions yet. Requests keep following the policy you defined, and the engine
              keeps watching.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function SequenceControls({
  paused,
  reduced,
  playing,
  onToggle,
  onReplay,
}: {
  paused: boolean;
  reduced: boolean;
  playing: boolean;
  onToggle: () => void;
  onReplay: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {reduced ? null : (
        <button
          type="button"
          onClick={onToggle}
          aria-label={paused || !playing ? "Play sequence" : "Pause sequence"}
          className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          {paused || !playing ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
        </button>
      )}
      <button
        type="button"
        onClick={onReplay}
        className="rounded-full px-3 py-1.5 ds-text-12 font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        Replay
      </button>
    </div>
  );
}

const modes = [
  {
    name: "Observe",
    icon: Eye,
    body: "Decisions and their context are recorded. Nothing about runtime behaviour changes.",
    state: "On by default",
  },
  {
    name: "Recommend",
    icon: Lightbulb,
    body: "Repeatable patterns are surfaced as a proposed rule, with the decisions behind it.",
    state: "Review in the console",
  },
  {
    name: "Enforce",
    icon: ShieldCheck,
    body: "An administrator enables a recommendation before it can affect a single decision.",
    state: "Explicit opt-in",
  },
];

/** The staged governance model: learning never bypasses administration. */
export function AdaptiveModes({ className }: { className?: string }) {
  return (
    <div className={cn("relative grid gap-4 md:grid-cols-3", className)}>
      <div aria-hidden className="path-line absolute inset-x-8 ds-top-52 hidden h-px md:block" />
      {modes.map((m, i) => {
        const Icon = m.icon;
        return (
          <div key={m.name} className="lift relative ds-rounded-plus-10 bg-surface p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="ds-text-11 font-medium uppercase ds-tracking-0_16 text-muted-foreground">
                Step {i + 1}
              </span>
            </div>
            <h3 className="mt-5 ds-text-22 font-medium tracking-tight">{m.name}</h3>
            <p className="mt-3 ds-text-15 leading-relaxed text-muted-foreground">{m.body}</p>
            <div className="mt-5 ds-text-13 text-primary">{m.state}</div>
          </div>
        );
      })}
    </div>
  );
}

const patterns = [
  {
    kind: "Pattern detected",
    tone: "primary" as const,
    body: "Production database migrations have been approved 8 times when requested by Release Bot during scheduled deployment windows.",
    actions: ["Review recommendation", "Keep requiring approval"],
  },
  {
    kind: "Repeated decline",
    tone: "danger" as const,
    body: "Requests to expose public database ports have been declined 5 times.",
    actions: ["Add explicit deny rule", "Dismiss"],
  },
  {
    kind: "Reviewer routing",
    tone: "info" as const,
    body: "Infrastructure changes are consistently routed to the Security Lead.",
    actions: ["Set default reviewer", "Dismiss"],
  },
  {
    kind: "Behaviour change",
    tone: "warning" as const,
    body: "This request differs from previously approved deploys because it adds a new external destination.",
    actions: ["Continue requiring approval"],
  },
];

/** Realistic examples of what the engine surfaces — allow, deny and routing. */
export function PatternCards({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {patterns.map((p) => (
        <article key={p.kind} className="lift flex flex-col ds-rounded-plus-10 bg-surface p-6 sm:p-7">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "size-1.5 rounded-full",
                p.tone === "primary" && "bg-primary",
                p.tone === "danger" && "bg-destructive",
                p.tone === "info" && "bg-info",
                p.tone === "warning" && "bg-warning",
              )}
              aria-hidden
            />
            <h3 className="ds-text-13 font-medium uppercase ds-tracking-0_14 text-muted-foreground">{p.kind}</h3>
            <IllustrativeTag className="ml-auto" />
          </div>
          <p className="mt-4 flex-1 ds-text-16 leading-relaxed">{p.body}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {p.actions.map((a, i) => (
              <span
                key={a}
                className={cn(
                  "rounded-lg px-3.5 py-2 ds-text-13 font-medium",
                  i === 0 ? "bg-primary-soft text-primary" : "bg-surface-2 text-muted-foreground",
                )}
              >
                {a}
              </span>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

/** Reassurance, stated plainly and once. */
export function AdaptiveSafetyNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex max-w-2xl items-start gap-3 ds-text-15 leading-relaxed text-muted-foreground", className)}>
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span>
        BehalfID does not silently expand an agent&rsquo;s permissions. Learned patterns become bounded
        recommendations or administrator-enabled rules, and every one of them can be reviewed, audited or turned off.
      </span>
    </p>
  );
}
