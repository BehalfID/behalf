"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui";

export const docsNav = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/quickstart", label: "Quickstart" },
  { href: "/docs/api", label: "API" },
  { href: "/docs/sdk", label: "SDK" },
  { href: "/docs/webhooks", label: "Webhooks" },
  { href: "/docs/concepts", label: "Concepts" }
];

export function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="docs-page">
      <aside className="docs-sidebar">
        <Logo />
        <p className="sidebar-label">Developer docs</p>
        <nav aria-label="Documentation">
          {docsNav.map((item) => (
            <Link aria-current={pathname === item.href ? "page" : undefined} href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <article className="docs-article">{children}</article>
    </main>
  );
}
