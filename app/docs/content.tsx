import Link from "next/link";
import { DocsLayout } from "@/components/layout/DocsLayout";
import { CodeBlock as SharedCodeBlock } from "@/components/ui";

export const docsNav = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/quickstart", label: "Quickstart" },
  { href: "/docs/api", label: "API" },
  { href: "/docs/sdk", label: "SDK" },
  { href: "/docs/webhooks", label: "Webhooks" },
  { href: "/docs/site-guard", label: "Site Guard" },
  { href: "/docs/concepts", label: "Concepts" },
  { href: "/security", label: "Security" }
];

export function DocsShell({
  title,
  description,
  children,
  previous,
  next
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  previous?: { href: string; label: string };
  next?: { href: string; label: string };
}) {
  return (
    <DocsLayout>
      <div className="docs-article__inner">
        <p className="section-kicker">Documentation</p>
        <h1>{title}</h1>
        {description ? <p className="docs-lede">{description}</p> : null}
        {children}
        {previous || next ? (
          <nav className="docs-pager" aria-label="Documentation pagination">
            {previous ? (
              <Link className="docs-next" href={previous.href}>
                <span>Previous</span>
                <strong>{previous.label}</strong>
              </Link>
            ) : <span />}
            {next ? (
              <Link className="docs-next" href={next.href}>
                <span>Next</span>
                <strong>{next.label}</strong>
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </DocsLayout>
  );
}

export function CodeBlock({ children, label }: { children: string; label?: string }) {
  return <SharedCodeBlock className="docs-code" label={label}>{children}</SharedCodeBlock>;
}
