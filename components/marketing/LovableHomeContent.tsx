"use client";

import Link from "next/link";
import { Section } from "@/components/design-system/MarketingLayout";
import {
  ApprovalSequence,
  AuthorityFlowCanvas,
  AuthorityMap,
  DashboardShowcase,
  IdentityCanvas,
  PermissionBoundaries,
  SlashSeam
} from "@/components/design-system/marketing-visuals";
import {
  AdaptiveModes,
  AdaptiveSafetyNote,
  LearningTimeline,
  PatternCards
} from "@/components/design-system/adaptive-visuals";
import { BetaTag, Reveal } from "@/components/design-system/motion";
import { TrustCallout } from "@/components/design-system/TrustCallout";
import { CodeTabs } from "@/components/design-system/code";
import { ArrowRight } from "@/components/design-system/icons";
import { crossAppClickHandler } from "@/lib/subdomainRouting";
import { TestimonialWall } from "@/components/marketing/TestimonialWall";
import { TrustPostureStrip } from "@/components/marketing/TrustPostureStrip";
import { SecondaryCta, SignupCta } from "@/components/marketing/SignupCta";
import { PLAN_ENTITLEMENTS, formatLimit } from "@/lib/plans";
import { SDK_NPM_URL, SDK_PACKAGE, formatDownloads, type SdkDownloads } from "@/lib/npmDownloads";

const freePlan = PLAN_ENTITLEMENTS.free;

const sdkSnippet = `import { behalf } from "@behalfid/sdk";

const decision = await behalf.verify({
  agent: "cursor-agent",
  action: "deploy_service",
  resource: "payments-api",
});

if (decision.allowed) await deploy();`;

const decisionSnippet = `{
  "allowed": false,
  "reason": "production requires approval",
  "approval": "requested",
  "decidedBy": "Engineering Lead"
}`;

const cliSnippet = `behalf agents create cursor-agent --provider cursor`;

const mcpSnippet = `behalf mcp connect --server internal-tools`;

export function LovableHomeContent({ downloads = null }: { downloads?: SdkDownloads | null }) {
  return (
    <>
      {/* ── Hero — warm ivory, one dominant composition ─────────────── */}
      <section className="env-ivory relative overflow-hidden">
        {/* Intentional deviation from Lovable: tighter header→hero gap (see PR #164).
            Content-driven padding only — no viewport-height positioning. */}
        <div className="mx-auto max-w-7xl px-5 pt-10 sm:px-8 sm:pt-14 lg:pt-16 xl:pt-[5.5rem]">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-primary">
              <span aria-hidden>/</span> Approval gates for coding agents
            </div>
            {/* Mobile spacing is tightened at the base breakpoint and restored
                from `sm`: on a phone this block is the whole first screen, and
                the desktop rhythm spent enough of it on gaps to push the CTA
                out of view. Copy is unchanged — only the gaps move. */}
            <h1 className="display-2xl mt-5 sm:mt-7">
              Give AI agents freedom.
              <span className="mt-1 block text-muted-foreground">Keep their authority controlled.</span>
            </h1>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-muted-foreground sm:mt-8 sm:text-[18px]">
              Decide what coding agents such as Claude Code, Codex and Cursor may do, what is always denied, and what
              requires human approval &mdash; before the action runs, not after.
            </p>
            {/* The nouns the audience actually searches for, kept above the fold. */}
            <p className="mt-4 max-w-lg text-[17px] font-medium leading-relaxed sm:mt-5 sm:text-[18px]">
              Every action gets an allow, deny, or approval-required decision &mdash; fail closed at the integration
              point.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:items-center">
              <SignupCta placement="home_hero" />
              <SecondaryCta href="#authority">See how it works</SecondaryCta>
            </div>
            {/* What the CTA actually costs, next to the CTA. The numbers come
                from the live entitlement table, so the promise cannot drift
                away from the plan the visitor is about to land on. */}
            <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-muted-foreground">
              Free plan, no credit card &mdash;{" "}
              <span className="num font-medium text-foreground">{formatLimit(freePlan.maxAgents)} agents</span> and{" "}
              <span className="num font-medium text-foreground">
                {formatLimit(freePlan.monthlyVerifications)} verifications
              </span>{" "}
              a month.
            </p>
            <TrustCallout className="mt-5 max-w-lg" />
          </div>
        </div>

        {/* the canvas overlaps into the next environment */}
        <div className="mx-auto mt-16 max-w-7xl px-5 sm:mt-20 sm:px-8">
          <AuthorityFlowCanvas className="-mb-24 sm:-mb-32" />
        </div>
        <div className="h-24 sm:h-32" />
      </section>

      {/* ── Social proof strip ───────────────────────────────────────── */}
      <Section wide className="env-stone" bleed>
        <div className="flex flex-wrap items-center gap-x-12 gap-y-4 py-14">
          <p className="text-[15px] font-medium">Built for teams running agents in real workflows</p>
          <ul className="flex flex-wrap gap-x-10 gap-y-2 text-[15px] text-muted-foreground">
            {["Coding agents", "Deployment automation", "MCP tools", "Financial actions", "Internal operations"].map(
              (label) => (
                <li key={label}>{label}</li>
              )
            )}
          </ul>
        </div>
      </Section>

      {/* Named-user proof. Renders only once lib/testimonials.ts holds real quotes. */}
      <TestimonialWall />

      {/* ── Signature section: the authority map — deep charcoal ─────── */}
      <section id="authority" className="dark env-charcoal text-foreground">
        <div className="mx-auto max-w-7xl px-5 py-28 sm:px-8 sm:py-36">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <h2 className="display-lg max-w-[18ch]">One path, from request to action.</h2>
            <p className="max-w-sm text-[16px] leading-relaxed text-muted-foreground">
              Inside the enforcement path, nothing skips the checkpoint. Routine work passes without friction; risk
              stops and waits.
            </p>
          </div>
          <SlashSeam className="my-14 max-w-[220px]" />
          <AuthorityMap />

          {/* Enforcement boundary: structural vs advisory — kept in sync with /security */}
          <div className="hairline-t mt-16 pt-10">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
              Enforcement boundary
            </div>
            <div className="mt-6 grid gap-10 lg:grid-cols-2">
              <div>
                <h3 className="text-[16px] font-medium">Structural enforcement</h3>
                <p className="mt-3 max-w-lg text-[15px] font-medium leading-relaxed">
                  Every action resolves to allow, deny, or approval required &mdash; and fails closed at the
                  integration point.
                </p>
                <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
                  Where the check sits in the execution path &mdash; action-time hooks installed by the CLI,{" "}
                  <code className="font-mono text-[13px]">behalf.verify()</code>{" "}
                  in your own code, or the Action Gateway &mdash; a denied or approval-required decision means the
                  integrated executor does not run.
                  Outage behavior is path-specific and documented per integration.
                </p>
              </div>
              <div>
                <h3 className="text-[16px] font-medium">Advisory context</h3>
                <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
                  Advisory MCP tools, passport links and memory blocks tell an agent what it is allowed to do. They
                  inform the model &mdash; they do not intercept. An action that bypasses the enforcement point cannot
                  be stopped by an advisory integration.
                </p>
              </div>
            </div>
            <Link
              href="/security"
              className="group mt-8 inline-flex items-center gap-2 text-[15px] text-primary hover:underline"
              onClick={crossAppClickHandler("/security")}
            >
              How enforcement works
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Adaptive engine — the learning story, policy stays in charge ── */}
      <Section wide className="env-ivory" id="adaptive">
        <Reveal className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">Adaptive mode</div>
            <BetaTag label="Beta" />
          </div>
          <h2 className="display-lg mt-5">Human decisions become better defaults.</h2>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
            Every approval and decline gives BehalfID more context about how your team handles risk. Over time, the
            engine can recognize recurring patterns, improve recommendations and reduce unnecessary
            interruptions&mdash;without overriding the policies you set.
          </p>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed">
            Explicit permissions and organizational policy always remain in control.
          </p>
        </Reveal>

        <Reveal delay={80}>
          <LearningTimeline className="mt-14" />
          {/* The timeline is a worked example, not a measurement — say which
              part is real rather than leaving an unlabelled illustrative panel
              as the only evidence the engine exists. */}
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            The decision counts above are a worked example. What is live today: the engine records every approval and
            decline, and the decision history behind these recommendations is visible in your own dashboard from the
            first action you verify.
          </p>
        </Reveal>

        <Reveal delay={60} className="mt-20">
          <h3 className="display-lg max-w-[28ch] text-[1.75rem] sm:text-[2rem]">
            Observe. Recommend. Enforce &mdash; only when a person says so.
          </h3>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted-foreground">
            Adaptive mode observes how authorized humans decide recurring requests. It uses those decisions to surface
            policy recommendations and, when explicitly enabled, handle well-understood cases with less interruption.
          </p>
          <AdaptiveModes className="mt-10" />
          <AdaptiveSafetyNote className="mt-10" />
          <Link
            href="/adaptive-engine"
            className="group mt-8 inline-flex items-center gap-2 text-[15px] text-primary hover:underline"
          >
            How adaptive mode works
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </Reveal>
      </Section>

      {/* ── What the engine surfaces — pale stone ─────────────────────── */}
      <Section wide className="env-stone">
        <Reveal className="max-w-2xl">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">Evidence</div>
          <h2 className="display-lg mt-5">Every approval becomes evidence.</h2>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
            Patterns cover the whole decision surface: what should keep waiting for a person, what is consistently
            declined, who should review it, and when a request no longer looks like the ones approved before.
          </p>
        </Reveal>
        <Reveal delay={80}>
          <PatternCards className="mt-12" />
        </Reveal>
      </Section>

      {/* ── Oversized editorial statement — pale stone ───────────────── */}
      <section id="product" className="env-stone">
        <div className="mx-auto max-w-7xl px-5 py-28 sm:px-8 sm:py-36">
          <p className="display-xl max-w-[20ch]">
            Autonomy should not mean <span className="text-primary">unlimited authority</span>.
          </p>
        </div>
      </section>

      {/* ── Identity — oversized identity canvas ─────────────────────── */}
      <Section wide className="env-ivory">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.62fr)_minmax(0,1.38fr)] lg:items-center lg:gap-16">
          <div className="max-w-sm">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">Identity</div>
            <h2 className="display-lg mt-5">Every agent should answer for itself.</h2>
            <p className="mt-6 text-[17px] leading-relaxed text-muted-foreground">
              Replace shared credentials with named identities, scoped authority, and a complete record of who acted.
            </p>
          </div>
          <IdentityCanvas />
        </div>
      </Section>

      {/* ── Permissions — copper-tinted, full-width boundaries ───────── */}
      <Section wide className="env-copper">
        <div className="max-w-2xl">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">Permissions</div>
          <h2 className="display-lg mt-5">Authority should be explicit.</h2>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-muted-foreground">
            Scope is a boundary, not a setting buried in a policy file. Inside it, agents move. Outside it, they ask.
          </p>
        </div>
        <PermissionBoundaries className="mt-16" />
      </Section>

      {/* ── Approvals — warm white, staged story ─────────────────────── */}
      <Section wide className="env-ivory">
        <div className="max-w-2xl">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">Approvals</div>
          <h2 className="display-lg mt-5">Routine work flows. Risk waits.</h2>
        </div>
        <ApprovalSequence className="mt-16" />
      </Section>

      {/* ── Dashboard showcase — deep charcoal, largest surface ──────── */}
      <section className="dark env-charcoal text-foreground">
        <div className="mx-auto max-w-7xl px-5 py-28 sm:px-8 sm:py-36">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="display-lg max-w-[20ch]">See every action. Understand every decision.</h2>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-[15px] text-primary hover:underline"
              onClick={crossAppClickHandler("/login")}
            >
              Open the dashboard <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          {/* The panel below is a sample workspace and is labelled as such. This
              line is the one number on the page anybody can go and check. */}
          {downloads ? (
            <p className="mt-8 text-[15px] leading-relaxed text-muted-foreground">
              The numbers in the panel below are illustrative.{" "}
              <span className="num font-medium text-foreground">{formatDownloads(downloads.count)}</span> downloads of{" "}
              <a
                className="text-primary underline underline-offset-2"
                href={SDK_NPM_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                <code className="font-mono text-[13px]">{SDK_PACKAGE}</code>
              </a>{" "}
              in the last 30 days is not &mdash; that is npm&apos;s count, and you can check it.
            </p>
          ) : null}
          <DashboardShowcase className="canvas-light mt-16" />
        </div>
      </section>

      {/* ── Developers — near-black ──────────────────────────────────── */}
      <section className="dark env-ink text-foreground">
        <div className="mx-auto max-w-7xl px-5 py-28 sm:px-8 sm:py-36">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-16">
            <div className="min-w-0 max-w-sm">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">Developers</div>
              <h2 className="display-lg mt-5">One decision before the action.</h2>
              <p className="mt-6 text-[16px] leading-relaxed text-muted-foreground">
                Drop the SDK into the code path that performs the action. No proxy, no sidecar, no migration.
              </p>
              <Link
                href="/docs/quickstart"
                className="mt-7 inline-flex items-center gap-2 text-[15px] text-primary hover:underline"
                onClick={crossAppClickHandler("/docs/quickstart")}
              >
                Read the quickstart <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <CodeTabs
                tabs={[
                  { id: "sdk", label: "SDK", language: "ts", code: sdkSnippet },
                  { id: "cli", label: "CLI", language: "bash", code: cliSnippet },
                  { id: "mcp", label: "MCP", language: "bash", code: mcpSnippet }
                ]}
              />
              <div className="min-w-0 overflow-hidden rounded-xl bg-surface p-5">
                <div id="decision-example-label" className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Decision
                </div>
                {/* Horizontally scrollable: focusable so keyboard users can scroll it. */}
                <pre
                  tabIndex={0}
                  role="region"
                  aria-labelledby="decision-example-label"
                  className="mt-4 max-w-full overflow-x-auto font-mono text-[12.5px] leading-relaxed text-muted-foreground"
                >
                  {decisionSnippet}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Security — pale neutral ──────────────────────────────────── */}
      <Section className="env-stone">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-16">
          <h2 className="display-lg max-w-[14ch]">Default to no. Allow with intent.</h2>
          <dl>
            {[
              ["Evaluated before execution", "Integrated action paths — hooks, SDK, gateway — get an allow, deny or approval decision before the action takes effect."],
              ["Scoped, single-use approvals", "An approval covers one request and expires on its own."],
              ["Decision logs", "Allowed, denied or approved — with who decided, the policy path, and why."],
              ["Managed profiles", "Reusable controls for coding agents at the tool boundary, including pause and required modes."],
              ["No inherited authority", "Agents never receive more reach than they were granted."]
            ].map(([k, v]) => (
              <div key={k} className="hairline-t grid gap-2 py-7 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] sm:gap-10">
                <dt className="text-[16px] font-medium">{k}</dt>
                <dd className="text-[15px] leading-relaxed text-muted-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="hairline-t mt-2 grid gap-10 pt-7 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-16">
          <div aria-hidden />
          <Link
            href="/security"
            className="group inline-flex items-center gap-2 text-[15px] text-primary hover:underline"
            onClick={crossAppClickHandler("/security")}
          >
            Read the full security model
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
      </Section>

      {/* Dated compliance posture, on the page rather than a link away. */}
      <TrustPostureStrip downloads={downloads} />
    </>
  );
}
