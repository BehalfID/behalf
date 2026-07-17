import Link from "next/link";
import { Logo, ThemeToggle } from "@/components/ui";

export function PublicErrorState({
  code,
  title,
  description,
  children
}: {
  code: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main id="main-content" className="public-error-page" tabIndex={-1}>
      <header className="public-error-header">
        <Logo markStyle="framed" />
        <nav aria-label="Error page utilities">
          <Link href="/docs">Docs</Link>
          <Link href="/status">Status</Link>
          <ThemeToggle />
        </nav>
      </header>

      <section className="public-error-state" aria-labelledby="public-error-title">
        <p className="public-error-state__code">{code}</p>
        <h1 id="public-error-title">{title}</h1>
        <p className="public-error-state__description">{description}</p>
        <div className="public-error-state__actions">{children}</div>
      </section>

      <footer className="public-error-footer">
        <span>BehalfID</span>
        <nav aria-label="Error page footer">
          <Link href="/security">Security</Link>
          <Link href="/privacy">Privacy</Link>
          <a href="mailto:support@behalfid.com">Support</a>
        </nav>
      </footer>
    </main>
  );
}
