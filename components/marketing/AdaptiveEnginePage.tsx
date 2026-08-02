"use client";

import Link from "next/link";
import { MarketingLayout, Section, SectionHeading } from "@/components/design-system/MarketingLayout";
import {
  AdaptiveModes,
  AdaptiveSafetyNote,
  LearningTimeline,
  PatternCards
} from "@/components/design-system/adaptive-visuals";
import { SlashSeam } from "@/components/design-system/marketing-visuals";
import { BetaTag, Reveal } from "@/components/design-system/motion";
import { ArrowRight } from "@/components/design-system/icons";
import type { PublicAuthAction } from "@/lib/publicAuthAction";

const governance = [
  {
    k: "Confidence and evidence",
    v: "A recommendation always shows how many comparable decisions it rests on, who made them and how consistent they were. Thin evidence stays an observation."
  },
  {
    k: "Administrator control",
    v: "Nothing learned changes runtime behaviour until an administrator reviews and enables it. Recommendations can be dismissed, narrowed or kept as approval-only."
  },
  {
    k: "Audit history",
    v: "Adaptive rules are recorded like any other policy change: who enabled it, on what evidence, and every decision it has handled since."
  },
  {
    k: "Rollback and disable",
    v: "An adaptive rule can be disabled instantly. Requests it used to handle fall back to the explicit policy underneath it."
  }
];

const learns = [
  "Whether an action should be automatically allowed under an administrator-approved adaptive rule",
  "Whether an action should continue requiring approval",
  "Whether a recurring action is usually declined",
  "Which human role should review a request",
  "Which context is most relevant to a reviewer",
  "Whether an action differs materially from previously approved behaviour",
  "Whether a policy recommendation should be surfaced at all"
];

export function AdaptiveEnginePage({
  authAction,
  googleEnabled
}: {
  authAction: PublicAuthAction;
  googleEnabled: boolean;
}) {
  return (
    <MarketingLayout authAction={authAction} googleEnabled={googleEnabled}>
      <section className="env-ivory">
        <div className="mx-auto max-w-7xl px-5 pb-24 pt-20 sm:px-8 sm:pb-32 sm:pt-28">
          <Reveal className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
                Adaptive engine
              </span>
              <BetaTag label="In development" />
            </div>
            <h1 className="display-xl mt-6">The engine learns where judgment is needed.</h1>
            <p className="mt-7 max-w-xl text-[18px] leading-relaxed text-muted-foreground">
              BehalfID starts with the policies, permissions and authority requirements you define. Adaptive mode
              observes the decisions your team makes on top of them and turns repeated judgment into bounded
              recommendations.
            </p>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed">Policy first. Learning second.</p>
          </Reveal>
          <Reveal delay={80}>
            <LearningTimeline className="mt-14" />
          </Reveal>
        </div>
      </section>

      <section className="dark env-charcoal text-foreground">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
          <Reveal className="max-w-2xl">
            <h2 className="display-lg max-w-[20ch]">Three states, in order, with a person at the gate.</h2>
          </Reveal>
          <SlashSeam className="my-12 max-w-[220px]" />
          <Reveal delay={60}>
            <AdaptiveModes />
          </Reveal>
          <Reveal delay={80}>
            <AdaptiveSafetyNote className="mt-12" />
          </Reveal>
        </div>
      </section>

      <Section wide className="env-stone">
        <Reveal>
          <SectionHeading
            eyebrow="What it learns"
            title="Patterns across allow, deny and approval."
            description="Learning is not limited to declining things. The engine looks at the whole decision surface, and stays bounded by explicit policy in every case."
          />
        </Reveal>
        <Reveal delay={60}>
          <ul className="mt-12 grid gap-x-12 gap-y-0 sm:grid-cols-2">
            {learns.map((item) => (
              <li key={item} className="hairline-t py-5 text-[16px] leading-relaxed">
                {item}
              </li>
            ))}
          </ul>
        </Reveal>
      </Section>

      <Section wide className="env-ivory">
        <Reveal>
          <SectionHeading
            eyebrow="Examples"
            title="What a recommendation looks like."
            description="Reference content from a sample workspace. Each recommendation carries the evidence behind it and the administrator action it needs."
          />
        </Reveal>
        <Reveal delay={60}>
          <PatternCards className="mt-12" />
        </Reveal>
      </Section>

      <Section className="env-stone">
        <Reveal>
          <SectionHeading eyebrow="Governance" title="Learning does not bypass administration." />
        </Reveal>
        <Reveal delay={60}>
          <dl className="mt-12">
            {governance.map(({ k, v }) => (
              <div
                key={k}
                className="hairline-t grid gap-2 py-7 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] sm:gap-10"
              >
                <dt className="text-[16px] font-medium">{k}</dt>
                <dd className="text-[15px] leading-relaxed text-muted-foreground">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-10 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Adaptive mode is in active development. Production includes adaptive-delegation surfaces for
            recommendations; the visuals on this page describe product direction and must not be read as measured
            accuracy or fully autonomous enforcement.
          </p>
          <Link
            href="/security"
            className="group mt-8 inline-flex items-center gap-2 text-[15px] text-primary hover:underline"
          >
            How we treat authority and audit
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </Reveal>
      </Section>
    </MarketingLayout>
  );
}
