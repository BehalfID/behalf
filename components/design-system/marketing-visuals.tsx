"use client";

import { ArrowUpRight, Check, Clock, Fingerprint, Lock, RotateCcw, ShieldCheck, Sparkles } from "./icons";
import { AgentAvatar } from "./brand";
import { SequenceControls } from "./adaptive-visuals";
import { IllustrativeTag } from "./motion";
import { useInView, usePrefersReducedMotion, useSequence } from "@/hooks/use-motion";
import { cn } from "@/lib/cn";

/**
 * Marketing-mode product compositions.
 *
 * Motif: the slash from Behalf/ID becomes a *decision path* — a thin copper
 * line that runs Agent → Identity → Permission → Approval → Action. Every
 * visual on the marketing site is a view onto some segment of that path.
 * Presentation only: no request IDs, no payloads, no terminal noise.
 */

/** Section seam built from repeating slashes. The brand's structural device. */
export function SlashSeam({ className }: { className?: string }) {
  return <div aria-hidden className={cn("slash-seam w-full", className)} />;
}

const flowSteps = [
  { label: "Request received", detail: "Deploy payments API to production", icon: ArrowUpRight, tone: "path" as const },
  { label: "Identity verified", detail: "Cursor agent · owned by Maya Okafor", icon: Fingerprint, tone: "path" as const },
  { label: "Permission matched", detail: "Deploy allowed in staging, not production", icon: ShieldCheck, tone: "path" as const },
  { label: "Approval requested", detail: "Production is outside the agent's scope", icon: Clock, tone: "gate" as const },
  { label: "Human decision", detail: "Jonas Beck · Engineering Lead approves once", icon: Check, tone: "path" as const },
  { label: "Action authorized", detail: "Single-use · expires in 60 minutes", icon: Check, tone: "done" as const },
  { label: "Decision recorded", detail: "Kept as evidence for future requests", icon: Sparkles, tone: "path" as const },
];

/**
 * Hero canvas. The copper decision path advances one checkpoint at a time and
 * loops slowly (~11s). Hover pauses it, any checkpoint can be inspected, and
 * reduced-motion readers get the resolved final state.
 */
export function AuthorityFlowCanvas({ className }: { className?: string }) {
  const { ref, active, select, replay, paused, setPaused, reduced, isPlaying } = useSequence(flowSteps.length, {
    interval: 1400,
    restAtEnd: 2800,
    loop: true,
  });
  const stage = flowSteps[active]!;
  const progress = (active / (flowSteps.length - 1)) * 100;

  return (
    <div
      ref={ref}
      className={cn("canvas-frame relative overflow-hidden", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(70%_100%_at_50%_0%,var(--color-primary-soft),transparent_75%)] opacity-80"
      />

      <div className="relative grid gap-8 p-6 sm:p-9 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)] lg:gap-12 lg:p-12">
        {/* Request */}
        <div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <span className="truncate text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Request
            </span>
            <SequenceControls
              paused={paused}
              reduced={reduced}
              playing={isPlaying}
              onToggle={() => setPaused((v) => !v)}
              onReplay={replay}
            />
          </div>
          <div className="mt-5 flex items-center gap-3.5">
            <AgentAvatar name="Cursor agent" provider="cursor" size="lg" />
            <div className="min-w-0">
              <div className="truncate text-[17px] font-medium tracking-tight">Cursor agent</div>
              <div className="truncate text-sm text-muted-foreground">acting for Maya Okafor</div>
            </div>
          </div>
          <p className="mt-6 text-2xl font-medium leading-tight tracking-tight sm:text-[28px]">
            Deploy <span className="text-primary">payments&nbsp;API</span> to production
          </p>
          <div
            className={cn(
              "mt-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] transition-colors duration-500",
              stage.tone === "gate" ? "bg-warning-soft text-warning" : "bg-surface-2 text-muted-foreground",
            )}
            aria-live="polite"
          >
            {stage.tone === "gate" ? (
              <Clock className="size-3.5" aria-hidden />
            ) : (
              <Sparkles className="size-3.5 text-primary" aria-hidden />
            )}
            {stage.tone === "gate" ? "Waiting on a person" : stage.label}
          </div>
        </div>

        {/* Decision path */}
        <div className="relative">
          <div aria-hidden className="absolute left-[15px] top-4 bottom-6 w-px bg-border" />
          <div
            aria-hidden
            className="path-line absolute left-[15px] top-4 w-px transition-[height] duration-700 ease-out"
            style={{ height: `calc(${progress}% - ${progress === 0 ? 0 : 10}px)` }}
          />
          <ol className="space-y-4">
            {flowSteps.map((s, i) => {
              const Icon = s.icon;
              const reached = i <= active;
              const isActive = i === active;
              return (
                <li key={s.label}>
                  <button
                    type="button"
                    onClick={() => select(i)}
                    aria-current={isActive}
                    className="relative flex w-full items-start gap-4 rounded-lg py-1 text-left"
                  >
                    <span
                      className={cn(
                        "relative z-10 grid size-8 shrink-0 place-items-center rounded-full transition-colors duration-500",
                        reached
                          ? s.tone === "gate"
                            ? "bg-warning text-warning-foreground"
                            : s.tone === "done"
                              ? "bg-primary text-primary-foreground"
                              : "bg-primary-soft text-primary"
                          : "bg-surface-2 text-muted-foreground",
                        isActive && !reduced && "path-pulse",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 pt-1">
                      <span
                        className={cn(
                          "block text-[15px] font-medium transition-colors duration-500",
                          reached ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {s.label}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 block text-[13px] leading-relaxed transition-opacity duration-500",
                          isActive ? "text-muted-foreground opacity-100" : "text-muted-foreground opacity-60",
                        )}
                      >
                        {s.detail}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

/** Oversized identity canvas: one agent, fully accountable. */
export function IdentityCanvas({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      {/* stacked identity layers behind the primary surface */}
      <div
        aria-hidden
        className="absolute inset-x-6 -top-4 h-16 rounded-[calc(var(--radius)+14px)] bg-surface opacity-40"
      />
      <div
        aria-hidden
        className="absolute inset-x-3 -top-2 h-16 rounded-[calc(var(--radius)+14px)] bg-surface opacity-70"
      />
      <div className="canvas-frame relative p-6 sm:p-9">
        <div className="flex flex-wrap items-start gap-5">
          <AgentAvatar name="Cursor agent" provider="cursor" size="lg" className="size-14 text-base" />
          <div className="min-w-0 flex-1">
            <h3 className="text-2xl font-medium tracking-tight sm:text-3xl">Cursor agent</h3>
            <p className="mt-1.5 text-[15px] text-muted-foreground">Owned by Maya Okafor · Engineering</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1.5 text-[13px] font-medium text-success">
            <span className="size-1.5 rounded-full bg-success" aria-hidden />
            Active
          </span>
        </div>

        <dl className="mt-9 grid gap-x-10 gap-y-7 sm:grid-cols-2">
          {[
            ["Environment", "development, staging"],
            ["Authority", "Deploy, read secrets, open PRs"],
            ["Recent action", "Merged release branch · allowed"],
            ["Beyond scope", "Production deploys, refunds over $500"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{k}</dt>
              <dd className="mt-2 text-[16px] leading-snug">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-9 flex items-center gap-4 rounded-xl bg-surface-2 px-4 py-3.5">
          <span className="text-[13px] text-muted-foreground">Every action answers to this identity</span>
          <span className="ml-auto text-[13px] text-primary">Every decision kept as evidence</span>
        </div>
      </div>
    </div>
  );
}

const boundaries = [
  { env: "Development", state: "Allowed", note: "Inside scope. Nothing to ask.", tone: "allow" as const },
  { env: "Staging", state: "Allowed", note: "Inside scope, spend capped at $500/day.", tone: "allow" as const },
  {
    env: "Production",
    state: "Approval required",
    note: "Outside scope until a named human says yes.",
    tone: "gate" as const,
  },
];

/** Full-width authority boundaries: scope rendered as regions, not rows. */
export function PermissionBoundaries({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-4 lg:grid-cols-3", className)}>
      {boundaries.map((b, i) => (
        <div
          key={b.env}
          className={cn(
            "node-in relative overflow-hidden rounded-[calc(var(--radius)+10px)] p-7 sm:p-8",
            b.tone === "allow" ? "bg-surface" : "bg-primary-soft",
            b.tone === "gate" && "lg:-mt-6 lg:mb-6 lg:shadow-[0_40px_80px_-48px_oklch(0.2_0.02_60_/_0.5)]",
          )}
          style={{ animationDelay: `${i * 130}ms` }}
        >
          {b.tone === "gate" ? (
            <div aria-hidden className="slash-seam absolute inset-x-0 top-0" />
          ) : (
            <div aria-hidden className="absolute inset-x-0 top-0 h-px path-line opacity-40" />
          )}
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Environment</div>
          <div className="mt-3 text-[26px] font-medium tracking-tight">{b.env}</div>
          <div
            className={cn(
              "mt-6 inline-flex items-center gap-2 text-[15px] font-medium",
              b.tone === "allow" ? "text-success" : "text-primary",
            )}
          >
            {b.tone === "allow" ? <Check className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />}
            {b.state}
          </div>
          <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-muted-foreground">{b.note}</p>
        </div>
      ))}
    </div>
  );
}

const approvalStages = [
  {
    title: "Routine action",
    caption: "Open a pull request on the checkout service.",
    outcome: "Allowed instantly",
    tone: "allow" as const,
  },
  {
    title: "Sensitive action",
    caption: "Deploy payments API to production.",
    outcome: "Paused",
    tone: "pause" as const,
  },
  {
    title: "Context delivered",
    caption: "Jonas Beck sees the agent, the reason and the blast radius.",
    outcome: "Awaiting decision",
    tone: "pause" as const,
  },
  {
    title: "Single-use approval",
    caption: "One request, one hour, no standing access granted.",
    outcome: "Approved",
    tone: "allow" as const,
  },
  {
    title: "Action proceeds",
    caption: "The deploy runs, the decision is recorded against the agent.",
    outcome: "Authorized",
    tone: "allow" as const,
  },
];

/** Staged approval story — advances on view, steerable by the reader. */
export function ApprovalSequence({ className }: { className?: string }) {
  const { ref, active, select: setActive, replay, setPaused } = useSequence(approvalStages.length, { interval: 2400, restAtEnd: 4200, loop: true });
  const stage = approvalStages[active] ?? approvalStages[0]!;

  return (
    <div
      ref={ref}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={cn("grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14", className)}
    >
      <ol className="relative space-y-1">
        <div aria-hidden className="absolute left-[9px] top-4 bottom-4 w-px bg-border" />
        <div
          aria-hidden
          className="path-line absolute left-[9px] top-4 w-px origin-top transition-[height] duration-700 ease-out"
          style={{ height: `calc(${(active / (approvalStages.length - 1)) * 100}% - ${active === 0 ? 0 : 8}px)` }}
        />
        {approvalStages.map((s, i) => (
          <li key={s.title}>
            <button
              type="button"
              onClick={() => setActive(i)}
              aria-current={i === active}
              className="relative flex w-full items-start gap-4 rounded-lg py-3 pr-3 text-left"
            >
              <span
                className={cn(
                  "relative z-10 mt-1 grid size-[19px] shrink-0 place-items-center rounded-full transition-colors",
                  i <= active ? "bg-primary" : "bg-border-strong",
                )}
              >
                <span className="size-1.5 rounded-full bg-background" aria-hidden />
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block text-[16px] font-medium transition-colors",
                    i === active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s.title}
                </span>
                <span className="mt-0.5 block text-[14px] leading-relaxed text-muted-foreground">{s.caption}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="canvas-frame self-start p-7 sm:p-9">
        <div className="flex items-center gap-3">
          <AgentAvatar name="Cursor agent" provider="cursor" size="md" />
          <div className="text-[15px] font-medium">Cursor agent</div>
          <span
            className={cn(
              "ml-auto rounded-full px-3 py-1 text-[13px] font-medium",
              stage.tone === "allow" ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
            )}
          >
            {stage.outcome}
          </span>
        </div>

        <p className="mt-7 text-[24px] font-medium leading-snug tracking-tight sm:text-[28px]">
          {stage.caption}
        </p>

        <div className="mt-8 flex items-center gap-3">
          {stage.tone === "pause" ? (
            <>
              <span className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
                <Check className="size-4" aria-hidden /> Approve once
              </span>
              <span className="text-sm text-muted-foreground">Expires in 60 minutes</span>
            </>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm text-success">
              <Check className="size-4" aria-hidden /> No one had to be interrupted
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={replay}
          className="mt-8 inline-flex items-center gap-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <RotateCcw className="size-3.5" aria-hidden /> Replay the sequence
        </button>
      </div>
    </div>
  );
}

const trend = [38, 44, 41, 52, 49, 61, 58, 67, 72, 69, 78, 84, 81, 92];

/** The largest product surface on the site: a curated workspace overview. */
export function DashboardShowcase({ className }: { className?: string }) {
  const { ref, inView } = useInView(0.2);
  const reduced = usePrefersReducedMotion();
  const shown = inView || reduced;

  return (
    <div ref={ref} className={cn("canvas-frame overflow-hidden", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-6 py-5 sm:px-8">
        <span className="text-[15px] font-medium">Overview</span>
        <span className="text-[13px] text-muted-foreground">Sample workspace</span>
        <IllustrativeTag />
        <span className="ml-auto text-[13px] text-muted-foreground">Last 24 hours</span>
      </div>

      <div className="grid items-start lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="p-6 sm:p-8 lg:pt-2">
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              { v: "3", k: "Pending approvals", accent: true },
              { v: "142", k: "Actions verified today" },
              { v: "9", k: "Active agents" },
            ].map((m) => (
              <div key={m.k}>
                <div className={cn("num text-[38px] font-medium leading-none tracking-tight", m.accent && "text-primary")}>
                  {m.v}
                </div>
                <div className="mt-2 text-[13px] text-muted-foreground">{m.k}</div>
              </div>
            ))}
          </div>

          <div className="mt-9">
            <div className="flex items-baseline gap-3">
              <span className="text-[13px] font-medium">Verification volume</span>
              <span className="text-[13px] text-muted-foreground">Last 14 days</span>
            </div>
            <div className="mt-4 flex h-24 items-end gap-1.5">
              {trend.map((h, i) => (
                <span
                  key={i}
                  className={cn(
                    "flex-1 origin-bottom rounded-sm transition-[height] duration-700 ease-out",
                    i > trend.length - 4 ? "bg-primary" : "bg-primary/25",
                  )}
                  style={{ height: shown ? `${h}%` : "4%", transitionDelay: reduced ? undefined : `${i * 35}ms` }}
                  aria-hidden
                />
              ))}
            </div>
          </div>

          <div className="mt-9">
            <div className="text-[13px] font-medium">Outcomes</div>
            <div className="mt-4 flex h-2.5 overflow-hidden rounded-full" aria-hidden>
              <span className="w-[86%] bg-success" />
              <span className="w-[9%] bg-warning" />
              <span className="w-[5%] bg-destructive" />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-7 gap-y-1.5 text-[13px] text-muted-foreground">
              <span>Mostly allowed</span>
              <span>Some approved by a person</span>
              <span>A few denied</span>
            </div>
          </div>

          <div className="mt-9">
            <div className="text-[13px] font-medium">Recent actions</div>
            <div className="mt-2">
              {[
                { agent: "Cursor agent", action: "Deploy payments API", outcome: "Awaiting approval", tone: "warning" },
                { agent: "Release bot", action: "Merge release branch", outcome: "Allowed", tone: "success" },
                { agent: "Ops assistant", action: "Rotate database secret", outcome: "Denied", tone: "danger" },
                { agent: "Billing agent", action: "Issue refund · $240", outcome: "Allowed", tone: "success" },
              ].map((row) => (
                <div key={row.action} className="flex items-center gap-4 py-3">
                  <AgentAvatar name={row.agent} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium">{row.action}</div>
                    <div className="truncate text-[12px] text-muted-foreground">{row.agent}</div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-[13px]",
                      row.tone === "success" && "text-success",
                      row.tone === "warning" && "text-warning",
                      row.tone === "danger" && "text-destructive",
                    )}
                  >
                    {row.outcome}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Selected agent rail */}
        <aside className="m-6 rounded-[calc(var(--radius)+10px)] bg-surface-2 p-6 sm:m-8 sm:ml-0 sm:p-7 lg:sticky lg:top-24">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Selected agent
          </div>
          <div className="mt-5 flex items-center gap-3">
            <AgentAvatar name="Cursor agent" provider="cursor" size="lg" />
            <div className="min-w-0">
              <div className="text-[16px] font-medium">Cursor agent</div>
              <div className="text-[13px] text-muted-foreground">Maya Okafor</div>
            </div>
          </div>

          <div className="mt-7 space-y-4">
            {[
              ["Scope", "development, staging"],
              ["Spend today", "$120 of $500"],
              ["Approvals this week", "2"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4">
                <span className="text-[13px] text-muted-foreground">{k}</span>
                <span className="text-[14px]">{v}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-xl bg-surface p-4">
            <div className="text-[13px] font-medium text-warning">Approval required</div>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
              Deploy payments API to production.
            </p>
            <span className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-[14px] font-medium text-primary-foreground">
              Review request
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

const mapNodes = [
  { label: "Agent", note: "Cursor agent, acting for Maya" },
  { label: "Identity", note: "Named, owned, revocable" },
  { label: "Permission", note: "Deploy · staging allowed" },
  { label: "Approval", note: "Production waits for a person" },
  { label: "Action", note: "Authorized, scoped, recorded" },
];

/** Signature section: the whole product as one advancing path. */
export function AuthorityMap({ className }: { className?: string }) {
  const { ref, active, select: setActive, replay, setPaused } = useSequence(mapNodes.length, { interval: 1700, restAtEnd: 3600, loop: true });
  const progress = (active / (mapNodes.length - 1)) * 100;

  return (
    <div
      ref={ref}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={cn("relative", className)}
    >
      {/* horizontal path */}
      <div aria-hidden className="absolute inset-x-0 top-[26px] hidden h-px bg-border md:block" />
      <div
        aria-hidden
        className="path-line absolute left-0 top-[26px] hidden h-px transition-[width] duration-700 ease-out md:block"
        style={{ width: `${progress}%` }}
      />
      {/* vertical path (mobile) */}
      <div aria-hidden className="absolute left-[13px] inset-y-2 w-px bg-border md:hidden" />
      <div
        aria-hidden
        className="path-line absolute left-[13px] top-2 w-px transition-[height] duration-700 ease-out md:hidden"
        style={{ height: `${progress}%` }}
      />

      <ol className="relative grid gap-8 md:grid-cols-5 md:gap-6">
        {mapNodes.map((n, i) => {
          const reached = i <= active;
          const gate = i === 3;
          return (
            <li key={n.label} className="flex gap-5 md:block">
              <button
                type="button"
                onClick={() => setActive(i)}
                className="flex shrink-0 items-start gap-5 text-left md:block"
                aria-current={i === active}
                aria-label={n.label}
              >
                <span
                  className={cn(
                    "grid size-7 place-items-center rounded-full transition-colors duration-500",
                    reached
                      ? gate
                        ? "bg-warning text-warning-foreground"
                        : "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-muted-foreground",
                  )}
                >
                  {gate && active === i ? (
                    <Clock className="size-3.5" aria-hidden />
                  ) : reached ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : (
                    <span className="size-1.5 rounded-full bg-current" aria-hidden />
                  )}
                </span>
              </button>
              <div className="md:mt-6">
                <div
                  className={cn(
                    "text-[19px] font-medium tracking-tight transition-colors duration-500",
                    reached ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {n.label}
                </div>
                <p className="mt-2 max-w-[22ch] text-[14px] leading-relaxed text-muted-foreground">{n.note}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-14 flex flex-wrap items-center gap-x-8 gap-y-3 text-[15px]">
        <span className="inline-flex items-center gap-2.5">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden />
          Routine actions pass without stopping
        </span>
        <span className="inline-flex items-center gap-2.5">
          <span className="size-1.5 rounded-full bg-warning" aria-hidden />
          Sensitive actions wait for a person
        </span>
        <button
          type="button"
          onClick={replay}
          className="ml-auto inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[14px] text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
        >
          <RotateCcw className="size-3.5" aria-hidden /> Replay the path
        </button>
      </div>
    </div>
  );
}