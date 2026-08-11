import type { Metadata } from "next";
import Link from "next/link";
import { MarketingLayout, Section, SectionHeading } from "@/components/design-system/MarketingLayout";
import { ArrowRight } from "@/components/design-system/icons";
import { TrustCallout } from "@/components/design-system/TrustCallout";
import type { ComparisonPageData } from "@/components/marketing/comparisons";
import type { PublicAuthAction } from "@/lib/publicAuthAction";

export function comparisonMetadata(data: ComparisonPageData): Metadata {
  const url = `https://behalfid.com/${data.slug}`;
  return {
    title: data.metaTitle,
    description: data.metaDescription,
    alternates: { canonical: `/${data.slug}` },
    robots: { index: true, follow: true },
    openGraph: {
      title: data.metaTitle,
      description: data.metaDescription,
      url,
      siteName: "BehalfID",
      type: "article"
    },
    twitter: { card: "summary_large_image", title: data.metaTitle, description: data.metaDescription }
  };
}

function jsonLdFor(data: ComparisonPageData) {
  const url = `https://behalfid.com/${data.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": data.kind === "category" ? "Article" : "WebPage",
        "@id": `${url}#page`,
        name: data.heading,
        headline: data.heading,
        description: data.metaDescription,
        url,
        dateModified: data.reviewed,
        isPartOf: { "@id": "https://behalfid.com/#website" },
        publisher: { "@id": "https://behalfid.com/#organization" }
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: data.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.q,
          acceptedAnswer: { "@type": "Answer", text: faq.a }
        }))
      }
    ]
  };
}

export function ComparisonPage({
  data,
  authAction,
  googleEnabled
}: {
  data: ComparisonPageData;
  authAction: PublicAuthAction;
  googleEnabled: boolean;
}) {
  return (
    <MarketingLayout authAction={authAction} googleEnabled={googleEnabled}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFor(data)) }}
      />

      <Section>
        <SectionHeading eyebrow={data.eyebrow} title={data.heading} description={data.lede} />
        <p className="mt-8 max-w-3xl border-l-2 border-primary pl-5 text-[17px] font-medium leading-relaxed">
          {data.shortAnswer}
        </p>
        <p className="mt-6 text-[13px] text-muted-foreground">
          Last reviewed{" "}
          <time dateTime={data.reviewed} className="font-medium text-foreground">
            {data.reviewedLabel}
          </time>
          {data.competitorName ? (
            <>
              {" "}
              &mdash; claims about {data.competitorName} reflect their public material on that date.
            </>
          ) : null}
        </p>
      </Section>

      {data.rows && data.columns ? (
        <Section className="bg-surface-2">
          <SectionHeading title="Side by side" />
          <div className="mt-8 overflow-x-auto rounded-lg border bg-surface">
            <table className="w-full ds-min-w-640 text-sm">
              <caption className="sr-only">
                {data.columns[0]} compared with {data.columns[1]} across integration, approvals, outage behaviour and
                pricing
              </caption>
              <thead>
                <tr className="border-b text-left">
                  <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                    Dimension
                  </th>
                  {data.columns.map((column) => (
                    <th key={column} scope="col" className="px-4 py-3 font-semibold">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.dimension} className="border-b align-top last:border-0">
                    <th scope="row" className="px-4 py-4 text-left font-medium">
                      {row.dimension}
                    </th>
                    <td className="px-4 py-4 leading-relaxed">{row.behalfid}</td>
                    <td className="px-4 py-4 leading-relaxed text-muted-foreground">{row.other}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {data.sections.map((section) => (
        <Section key={section.heading}>
          <SectionHeading title={section.heading} />
          {section.body.map((paragraph) => (
            <p key={paragraph.slice(0, 32)} className="mt-6 max-w-3xl text-[16px] leading-relaxed">
              {paragraph}
            </p>
          ))}
        </Section>
      ))}

      <Section className="bg-surface-2">
        <SectionHeading
          title="Where this page is biased"
          description="We wrote it, so read it that way. These are the things that cut against us."
        />
        <ul className="mt-8 max-w-3xl space-y-4">
          {data.honesty.map((point) => (
            <li key={point.slice(0, 32)} className="border-l-2 border-border pl-5 text-[15px] leading-relaxed">
              {point}
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <SectionHeading title="Questions" />
        <dl className="mt-8 max-w-3xl">
          {data.faqs.map((faq) => (
            <div key={faq.q} className="border-t py-7">
              <dt className="text-[16px] font-medium">{faq.q}</dt>
              <dd className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{faq.a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section className="bg-surface-2">
        <SectionHeading
          title="Try it against your own agents."
          description="Free tier, no sales call. The fastest honest test is to point a coding agent at a production deploy and watch it stop."
        />
        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/signup"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground"
          >
            Start building <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link
            href="/docs/deploy-approvals"
            className="inline-flex h-10 items-center justify-center rounded-full border border-border px-6 text-sm font-medium"
          >
            Read the deploy-approval guide
          </Link>
        </div>
        <TrustCallout className="mt-5 max-w-xl" />
      </Section>
    </MarketingLayout>
  );
}
