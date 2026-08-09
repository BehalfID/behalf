"use client";

import Link from "next/link";
import { Wordmark } from "@/components/design-system/brand";
import { cn } from "@/lib/cn";
import { crossAppClickHandler } from "@/lib/subdomainRouting";

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
      { label: "API", href: "/docs/api" },
      { label: "SDK", href: "/docs/sdk" },
      { label: "Status", href: "/status" }
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
      { label: "Compliance", href: "/compliance" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Legal", href: "/legal" }
    ]
  }
] as const;

export function MarketingFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("ds ds-footer env-ink dark", className)}>
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-10 md:ds-grid-footer">
          <div>
            <Wordmark className="ds-text-17" />
            <p className="mt-4 ds-max-w-24ch text-sm leading-relaxed text-muted-foreground">
              Identity, permissions and approval gates for AI agents.
            </p>
          </div>
          {columns.map((column) => (
            <div key={column.title}>
              <h2 className="ds-text-11 font-semibold uppercase tracking-wider text-muted-foreground">
                {column.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-foreground/80 transition-colors hover:text-foreground"
                      onClick={crossAppClickHandler(link.href)}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} BehalfID</span>
          <a href="mailto:security@behalfid.com">security@behalfid.com</a>
        </div>
      </div>
    </footer>
  );
}
