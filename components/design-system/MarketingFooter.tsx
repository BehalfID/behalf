import Link from "next/link";
import { Wordmark } from "@/components/design-system/brand";
import { cn } from "@/lib/cn";

/**
 * Lovable marketing footer shell (IA + presentation).
 * Contact/pricing/adaptive-engine destinations land in Phase 2.
 * Legal links preserve production routes.
 */
const columns = [
  {
    title: "Product",
    links: [
      { label: "Overview", href: "/" },
      { label: "Adaptive engine", href: "/adaptive-engine" },
      { label: "Pricing", href: "/pricing" }
    ]
  },
  {
    title: "Developers",
    links: [
      { label: "Quickstart", href: "/docs/quickstart" },
      { label: "Status", href: "/status" },
      { label: "API", href: "/docs/api" }
    ]
  },
  {
    title: "Company",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Contact", href: "/contact" },
      { label: "Design partners", href: "/design-partners" }
    ]
  },
  {
    title: "Trust",
    links: [
      { label: "Security", href: "/security" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Legal", href: "/legal" }
    ]
  }
] as const;

export function MarketingFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("ds ds-footer env-ink dark", className)}>
      <div className="ds-footer__inner">
        <div>
          <Wordmark />
          <p className="ds-footer__tagline">Identity and authority for AI agents.</p>
          <p className="ds-footer__meta">© {new Date().getFullYear()} BehalfID</p>
        </div>
        <nav className="ds-footer__cols" aria-label="Footer">
          {columns.map((column) => (
            <div key={column.title}>
              <h5>{column.title}</h5>
              <ul>
                {column.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </footer>
  );
}
