import Link from "next/link";

export const docsNav = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/quickstart", label: "Quickstart" },
  { href: "/docs/api", label: "API" },
  { href: "/docs/sdk", label: "SDK" },
  { href: "/docs/webhooks", label: "Webhooks" },
  { href: "/docs/concepts", label: "Concepts" }
];

export function DocsShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="docs-page">
      <aside className="docs-sidebar">
        <Link className="site-logo" href="/">
          <span className="site-logo__mark">B</span>
          <span>BehalfID</span>
        </Link>
        <nav>
          {docsNav.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
        </nav>
      </aside>
      <article className="docs-article">
        <p className="section-kicker">Documentation</p>
        <h1>{title}</h1>
        {children}
      </article>
    </main>
  );
}

export function CodeBlock({ children }: { children: string }) {
  return <pre className="docs-code">{children}</pre>;
}
