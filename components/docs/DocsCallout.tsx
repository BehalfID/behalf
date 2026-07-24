import type { ReactNode } from "react";

export type DocsCalloutTone = "note" | "tip" | "warn" | "danger";

const TONE_LABEL: Record<DocsCalloutTone, string> = {
  note: "Note",
  tip: "Tip",
  warn: "Warning",
  danger: "Fail closed"
};

export function DocsCallout({
  tone = "note",
  title,
  children
}: {
  tone?: DocsCalloutTone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside className={`docs-callout docs-callout--${tone}`} role="note">
      <strong className="docs-callout__label">{title ?? TONE_LABEL[tone]}</strong>
      <div className="docs-callout__body">{children}</div>
    </aside>
  );
}
