"use client";

import type { ProtectionPolicy } from "@/lib/protectionPolicy";
import {
  summarizeProtectionPolicy,
  type ProtectionSummaryEntry
} from "@/lib/protectionPolicyPermissions";

const BUCKETS = [
  {
    key: "allowed" as const,
    title: "Runs on its own",
    hint: "No interruption. Every attempt is still written to your activity log."
  },
  {
    key: "approval" as const,
    title: "Waits for you",
    hint: "The agent stops and asks. Nothing happens until a person approves it."
  },
  {
    key: "blocked" as const,
    title: "Refused",
    hint: "There is nothing to approve. BehalfID answers no."
  }
];

function EntryList({ entries }: { entries: ProtectionSummaryEntry[] }) {
  if (!entries.length) {
    return <p className="protect-summary__empty">Nothing in this group.</p>;
  }
  return (
    <ul className="protect-summary__list">
      {entries.map((entry) => (
        <li key={`${entry.controlId}-${entry.label}-${entry.detail ?? ""}`}>
          <span>{entry.label}</span>
          {entry.detail ? <em>{entry.detail}</em> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * The review a customer sees before finishing setup. Generated from the same
 * policy object that compiles into permissions, so it cannot drift from what
 * actually gets enforced.
 */
export function ProtectionSummary({
  policy,
  title = "Your starting policy",
  footnote
}: {
  policy: ProtectionPolicy;
  title?: string;
  footnote?: React.ReactNode;
}) {
  const summary = summarizeProtectionPolicy(policy);

  return (
    <section className="protect-summary" aria-label={title}>
      <header className="protect-summary__head">
        <h2>{title}</h2>
      </header>
      <div className="protect-summary__grid">
        {BUCKETS.map((bucket) => (
          <div className="protect-summary__bucket" data-bucket={bucket.key} key={bucket.key}>
            <p className="protect-summary__title">{bucket.title}</p>
            <p className="protect-summary__hint">{bucket.hint}</p>
            <EntryList entries={summary[bucket.key]} />
          </div>
        ))}
      </div>
      {footnote ? <p className="protect-summary__foot">{footnote}</p> : null}
    </section>
  );
}
