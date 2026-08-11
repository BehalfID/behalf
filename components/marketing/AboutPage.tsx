import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MarketingLayout, Section, SectionHeading } from "@/components/design-system/MarketingLayout";
import { ArrowRight } from "@/components/design-system/icons";
import {
  COMPANY_EMAIL,
  COMPANY_PROFILES,
  FOUNDERS,
  founderPersonSchema
} from "@/lib/founders";
import type { PublicAuthAction } from "@/lib/publicAuthAction";

const description =
  "Who builds BehalfID, why the three of us started it, and what the product does not do yet. Runtime authorization and approval gates for AI coding agents.";

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
    type: "website"
  },
  twitter: { card: "summary_large_image", title, description }
};

/**
 * Founding-team origin story, in company voice.
 *
 * Deliberately short and free of backstory: it says what the three of us ran
 * into and what we built, and nothing about who we were before that. Every
 * claim here is one the rest of the site already makes and can back up.
 */
const originStory = [
  "We started BehalfID after running into the same problem while working with increasingly capable AI coding agents. The agents could act — deploy, migrate, rotate a secret, move money — but the controls around what they were actually allowed to do were still too coarse. A key that lets an agent open a pull request usually lets it do far more, and nothing catches the difference until afterwards, in a log nobody reads.",
  "So we built the checkpoint we wanted. BehalfID gives agents enforceable permissions rather than standing credentials: one decision evaluated before the action runs, returned as allow, deny, or approval required, failing closed at the point where you integrate it. Routine work passes without friction. Risk stops and waits for a named person, and the approval becomes part of the audit trail.",
  "It is early, and we would rather say so here than have you find out during a security review. The enforcement loop works end to end today. The gaps are written down on the security page, not buried."
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
    "What is still early",
    "No formal external security audit yet. Claude Code's PreToolUse hook fails open on missing config and network timeouts — BehalfID is not universally fail-closed, and we will not describe it that way."
  ]
] as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function AboutPage({
  authAction,
  googleEnabled
}: {
  authAction: PublicAuthAction;
  googleEnabled: boolean;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "AboutPage",
        "@id": "https://behalfid.com/about#page",
        name: title,
        description,
        url: "https://behalfid.com/about",
        about: { "@id": "https://behalfid.com/#organization" }
      },
      {
        "@type": "Organization",
        "@id": "https://behalfid.com/#organization",
        name: "BehalfID",
        url: "https://behalfid.com",
        description,
        email: COMPANY_EMAIL,
        sameAs: COMPANY_PROFILES,
        founder: founderPersonSchema()
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

      <Section className="bg-surface-2">
        <SectionHeading title="Why we built it." />
        {originStory.map((paragraph) => (
          <p key={paragraph.slice(0, 24)} className="mt-6 max-w-3xl text-[16px] leading-relaxed">
            {paragraph}
          </p>
        ))}
      </Section>

      <Section>
        <SectionHeading
          eyebrow="Founding team"
          title="The three of us."
          description="BehalfID is built by three founders. If you are evaluating it, these are the people accountable for it."
        />
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FOUNDERS.map((founder) => (
            <li key={founder.name} className="flex flex-col rounded-xl border bg-surface p-6">
              {founder.photo ? (
                <Image
                  src={founder.photo}
                  alt={founder.photoAlt || `${founder.name}, ${founder.role} of BehalfID`}
                  width={64}
                  height={64}
                  className="mb-5 size-16 rounded-full object-cover"
                />
              ) : (
                /* Initials until a real headshot exists — derived from the name,
                   never a stock photo or an illustrated avatar. */
                <span
                  aria-hidden
                  className="mb-5 grid size-16 place-items-center rounded-full border border-primary/40 bg-primary-soft text-[17px] font-medium text-primary"
                >
                  {initials(founder.name)}
                </span>
              )}
              <h3 className="text-[17px] font-medium">{founder.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{founder.role}</p>
              {founder.linkedin || founder.x ? (
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  {founder.linkedin ? (
                    <a
                      className="text-primary underline underline-offset-2"
                      href={founder.linkedin}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      LinkedIn
                    </a>
                  ) : null}
                  {founder.x ? (
                    <a
                      className="text-primary underline underline-offset-2"
                      href={founder.x}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      X
                    </a>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
          Reach any of us at{" "}
          <a className="text-primary underline underline-offset-2" href={`mailto:${COMPANY_EMAIL}`}>
            {COMPANY_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section className="bg-surface-2">
        <SectionHeading
          eyebrow="Straight answers"
          title="What BehalfID does and does not do."
          description="A security buyer's first job is to find where a claim stops being true. Here is where ours stops, before you have to go looking."
        />
        <dl className="mt-10 max-w-3xl">
          {honestyPoints.map(([term, detail]) => (
            <div key={term} className="grid gap-2 border-t py-7 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:gap-10">
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

      <Section>
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
