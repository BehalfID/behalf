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
import { CodeTabs } from "@/components/design-system/code";
import { ArrowRight } from "@/components/design-system/icons";
import { crossAppClickHandler } from "@/lib/subdomainRouting";

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

export function LovableHomeContent() {
  return (
    <>
      <section className="env-ivory relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-5 pt-20 sm:px-8 sm:pt-28 lg:pt-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-primary">
              <span aria-hidden>/</span> Authority for AI agents
            </div>
            <h1 className="display-2xl mt-7">
              Give AI agents freedom.
              <span className="mt-1 block text-muted-foreground">Keep their authority controlled.</span>
            </h1>
            <p className="mt-8 max-w-lg text-[18px] leading-relaxed text-muted-foreground">
              Every agent gets an identity, a clear scope and a decision before it acts. BehalfID learns from human
              decisions to make that control more precise over time.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-[15px] font-medium text-primary-foreground shadow-raised"
                onClick={crossAppClickHandler("/signup")}
              >
                Start building <ArrowRight className="size-4" aria-hidden />
              </Link>
              <a href="#authority" className="inline-flex items-center justify-center rounded-full px-6 py-3 text-[15px] font-medium text-muted-foreground hover:text-foreground">
                See how it works
              </a>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-16 max-w-7xl px-5 sm:mt-20 sm:px-8">
          <AuthorityFlowCanvas className="-mb-24 sm:-mb-32" />
        </div>
        <div className="h-24 sm:h-32" />
      </section>

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

      <section id="authority" className="dark env-charcoal text-foreground">
        <div className="mx-auto max-w-7xl px-5 py-28 sm:px-8 sm:py-36">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <h2 className="display-lg max-w-[18ch]">One path, from request to action.</h2>
            <p className="max-w-sm text-[16px] leading-relaxed text-muted-foreground">
              Nothing an agent does skips a checkpoint. Routine work passes without friction; risk stops and waits.
            </p>
          </div>
          <SlashSeam className="my-14 max-w-[220px]" />
          <AuthorityMap />
        </div>
      </section>

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

      <section id="product" className="env-stone">
        <div className="mx-auto max-w-7xl px-5 py-28 sm:px-8 sm:py-36">
          <p className="display-xl max-w-[20ch]">
            Autonomy should not mean <span className="text-primary">unlimited authority</span>.
          </p>
        </div>
      </section>

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

      <Section wide className="env-ivory">
        <div className="max-w-2xl">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">Approvals</div>
          <h2 className="display-lg mt-5">Routine work flows. Risk waits.</h2>
        </div>
        <ApprovalSequence className="mt-16" />
      </Section>

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
          <DashboardShowcase className="canvas-light mt-16" />
        </div>
      </section>

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
              <div className="min-w-0 rounded-xl bg-surface p-5">
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Decision
                </div>
                <pre className="mt-4 overflow-x-auto font-mono text-[12.5px] leading-relaxed text-muted-foreground">
                  {decisionSnippet}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Section className="env-stone">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-16">
          <h2 className="display-lg max-w-[14ch]">Default to no. Allow with intent.</h2>
          <dl>
            {[
              ["Evaluated before execution", "Every sensitive action is decided before it can take effect."],
              ["Scoped, single-use approvals", "An approval covers one request and expires on its own."],
              ["Decision logs", "Allowed, denied or approved — with who decided, the policy path, and why."],
              ["Managed profiles", "Reusable controls for coding agents at the tool boundary, including pause and required modes."],
              ["No inherited authority", "Agents never receive more reach than they were granted."]
            ].map(([k, v]) => (
              <div
                key={k}
                className="hairline-t grid gap-2 py-7 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] sm:gap-10"
              >
                <dt className="text-[16px] font-medium">{k}</dt>
                <dd className="text-[15px] leading-relaxed text-muted-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>
    </>
  );
}
