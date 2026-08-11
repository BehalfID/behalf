import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MarketingLayout, Section, SectionHeading } from "@/components/design-system/MarketingLayout";
import { ArrowRight } from "@/components/design-system/icons";
import { FOUNDER, isFounderNamed } from "@/lib/founder";
import type { PublicAuthAction } from "@/lib/publicAuthAction";

const description =
  "Who builds BehalfID, why it exists, and what it does not do yet. Runtime authorization and approval gates for AI coding agents.";

const title = "About BehalfID — who builds it and why";

export const aboutMetadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/about" },
  robots: { index: true, follow: true },
  openGraph: {
    title,
    description,
    url: "https://behalfid.com/about",
    siteName: "BehalfID",
    type: "profile"
  },
  twitter: { card: "summary_large_image", title, description }
};

/**
 * First-person founder story. Only rendered once FOUNDER.name is filled in —
 * an unsigned "I" reads worse than no story at all.
 *
 * TODO(founder): rewrite these three paragraphs in your own words. They are
 * assembled from claims already published on this site (the enforcement model
 * on /security, the thesis in /blog/authorization-is-broken-for-ai-agents, and
 * the honesty note on /design-partners) so nothing here is invented — but the
 * point of this section is that it sounds like you, not like the marketing copy
 * on the rest of the page.
 */
const founderStory = [
  "I kept giving coding agents credentials that were far broader than the task in front of them. An agent that needs to open a pull request ends up holding a key that can also deploy, rotate a secret, or move money. Nothing catches that until after it has happened, in a log nobody reads.",
  "So I built the checkpoint I wanted: one decision, evaluated before the action runs, that comes back as allow, deny, or approval required — and fails closed at the point where you integrate it. Routine work passes without friction. Risk stops and waits for a person whose name ends up on the record.",
  "It is early, and I would rather say so here than have you find out during a security review. The enforcement loop works end to end today. The gaps are written down on the security page, not buried."
];

const honestyPoints = [
  [
    "What is enforced",
    "BehalfID enforces where you integrate it — the SDK in your own code path, the CLI's action-time hooks, or the Action Gateway. A denied or approval-required decision means the integrated executor does not run."
  ],
  [
    "What is advisory",
    "Passport links, memory blocks and advisory MCP tools tell an agent what it may do. They inform the model; they do not intercept. An action that skips the enforcement point is not covered, and we say so on every page that mentions them."
  ],
  [
    "What is not certified",
    "No SOC 2 Type I or Type II, no ISO 27001, no HIPAA. Controls hardening is underway and the current posture is documented in full, including the parts that are not finished."
  ],
  [
    "What is still a prototype",
    "No formal external security audit yet. Claude Code's PreToolUse hook fails open on missing config and network timeouts — it is not universally fail-closed, and we will not describe it that way."
  ]
] as const;

export function AboutPage({
  authAction,
  googleEnabled
}: {
  authAction: PublicAuthAction;
  googleEnabled: boolean;
}) {
  const named = isFounderNamed();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "AboutPage",
        "@id": "https://behalfid.com/about#page",
        name: title,
        description,
        url: "https://behalfid.com/about"
      },
      {
        "@type": "Organization",
        "@id": "https://behalfid.com/#organization",
        name: "BehalfID",
        url: "https://behalfid.com",
        description,
        email: FOUNDER.email,
        ...(named
          ? {
              founder: {
                "@type": "Person",
                name: FOUNDER.name,
                jobTitle: FOUNDER.role,
                ...(FOUNDER.linkedin ? { sameAs: [FOUNDER.linkedin, FOUNDER.x].filter(Boolean) } : {})
              }
            }
          : {})
      }
    ]
  };

  return (
    <MarketingLayout authAction={authAction} googleEnabled={googleEnabled}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Section>
        <SectionHeading
          eyebrow="About"
          title="Who builds BehalfID, and why."
          description="You are being asked to put a control in the path of your agents' actions. It is fair to want to know who is behind it and what it does not do yet."
        />
      </Section>

      {named ? (
        <Section className="bg-surface-2">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-16">
            <div>
              {FOUNDER.photo ? (
                <Image
                  src={FOUNDER.photo}
                  alt={FOUNDER.photoAlt || `${FOUNDER.name}, ${FOUNDER.role} of BehalfID`}
                  width={288}
                  height={288}
                  className="w-full max-w-[18rem] rounded-xl border object-cover"
                />
              ) : null}
              <h2 className="mt-5 text-[18px] font-medium">{FOUNDER.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {FOUNDER.role}, BehalfID
              </p>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {FOUNDER.linkedin ? (
                  <a
                    className="text-primary underline underline-offset-2"
                    href={FOUNDER.linkedin}
                    rel="me noopener noreferrer"
                    target="_blank"
                  >
                    LinkedIn
                  </a>
                ) : null}
                {FOUNDER.x ? (
                  <a
                    className="text-primary underline underline-offset-2"
                    href={FOUNDER.x}
                    rel="me noopener noreferrer"
                    target="_blank"
                  >
                    X
                  </a>
                ) : null}
                <a className="text-primary underline underline-offset-2" href={`mailto:${FOUNDER.email}`}>
                  {FOUNDER.email}
                </a>
              </div>
            </div>
            <div>
              <h2 className="display-lg">Why I built this.</h2>
              {founderStory.map((paragraph) => (
                <p key={paragraph.slice(0, 24)} className="mt-5 max-w-2xl text-[16px] leading-relaxed">
                  {paragraph}
                </p>
              ))}
              <p className="mt-6 text-sm text-muted-foreground">
                &mdash; {FOUNDER.name}, {FOUNDER.role}
              </p>
            </div>
          </div>
        </Section>
      ) : (
        <Section className="bg-surface-2">
          <SectionHeading
            title="Why this exists."
            description="Coding agents get handed credentials far broader than the task in front of them. An agent that needs to open a pull request ends up holding a key that can also deploy, rotate a secret, or move money — and nothing catches it until afterwards, in a log nobody reads."
          />
          <p className="mt-6 max-w-2xl text-[16px] leading-relaxed">
            BehalfID is the checkpoint that sits before the action: one decision, evaluated before the action runs,
            returned as allow, deny, or approval required, and failing closed at the point where you integrate it.
            Routine work passes without friction. Risk stops and waits for a person whose name ends up on the record.
          </p>
        </Section>
      )}

      <Section>
        <SectionHeading
          eyebrow="Straight answers"
          title="What BehalfID does and does not do."
          description="A security buyer's first job is to find where a claim stops being true. Here is where ours stops, before you have to go looking."
        />
        <dl className="mt-10 max-w-3xl">
          {honestyPoints.map(([term, detail]) => (
            <div key={term} className="grid gap-2 border-t py-7 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:gap-10">
              <dt className="text-[16px] font-medium">{term}</dt>
              <dd className="text-[15px] leading-relaxed text-muted-foreground">{detail}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          The long versions live on the{" "}
          <Link href="/security" className="text-primary underline underline-offset-2">
            security model
          </Link>{" "}
          and{" "}
          <Link href="/compliance" className="text-primary underline underline-offset-2">
            compliance posture
          </Link>{" "}
          pages, including the limitations list.
        </p>
      </Section>

      <Section className="bg-surface-2">
        <SectionHeading
          title="Talk to us."
          description="We answer within one business day. If BehalfID is not ready for what you need, we would rather tell you that than sell you a rollout."
        />
        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/design-partners"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground"
          >
            Become a design partner <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link
            href="/contact"
            className="inline-flex h-10 items-center justify-center rounded-full border border-border px-6 text-sm font-medium"
          >
            Contact
          </Link>
        </div>
      </Section>
    </MarketingLayout>
  );
}
