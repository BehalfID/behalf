import Link from "next/link";
import { Section } from "@/components/design-system/MarketingLayout";
import { SDK_NPM_URL, SDK_PACKAGE, formatDownloads, type SdkDownloads } from "@/lib/npmDownloads";
import { POSTURE, POSTURE_REVIEWED, POSTURE_REVIEWED_LABEL } from "@/lib/trustPosture";

/**
 * Dated trust posture, surfaced on the homepage instead of being a link away.
 *
 * Two things the audit found missing on a product auditors evaluate: the
 * compliance posture existed only behind a /compliance link, and there was no
 * dated or third-party signal anywhere. This puts the "what is and isn't
 * certified today" summary on the page with a review date next to it, plus the
 * one externally verifiable number that exists today (npm downloads).
 *
 * Third-party signals still missing and not inventable here: Product Hunt, G2,
 * press mentions, awards. Add them to `externalSignals` once they are real.
 */

export function TrustPostureStrip({ downloads }: { downloads: SdkDownloads | null }) {
  return (
    <Section wide className="env-stone">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">Trust posture</div>
          <h2 className="display-lg mt-5">What is and isn&apos;t certified today.</h2>
          <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-muted-foreground">
            Published rather than linked, because a security review should not have to go looking. Nothing on this
            list is aspirational &mdash; if it is not certified, it says not certified.
          </p>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Last reviewed{" "}
          <time dateTime={POSTURE_REVIEWED} className="font-medium text-foreground">
            {POSTURE_REVIEWED_LABEL}
          </time>
        </p>
      </div>

      <dl className="mt-12 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
        {POSTURE.map((row) => (
          <div key={row.framework} className="border-t pt-5">
            <dt className="text-[15px] font-medium">{row.framework}</dt>
            <dd className="mt-2 text-[14px] text-muted-foreground">
              <span className="font-medium text-foreground">{row.status}.</span> {row.detail}
            </dd>
          </div>
        ))}
      </dl>

      {downloads ? (
        <p className="mt-12 text-[15px] leading-relaxed">
          <span className="num text-[22px] font-medium">{formatDownloads(downloads.count)}</span>{" "}
          downloads of{" "}
          <a
            className="text-primary underline underline-offset-2"
            href={SDK_NPM_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            <code className="font-mono text-[14px]">{SDK_PACKAGE}</code>
          </a>{" "}
          in the last 30 days
          {downloads.end ? (
            <>
              {" "}
              &mdash; npm&apos;s count, to <time dateTime={downloads.end}>{downloads.end}</time>, not ours
            </>
          ) : null}
          .
        </p>
      ) : null}

      <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
        Full detail in the{" "}
        <Link href="/compliance" className="text-primary underline underline-offset-2">
          compliance posture
        </Link>{" "}
        and{" "}
        <Link href="/security" className="text-primary underline underline-offset-2">
          security model
        </Link>
        , including the current limitations list.
      </p>
    </Section>
  );
}
