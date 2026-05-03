import Link from "next/link";

export function Tabs({ items }: { items: { href: string; label: string; active?: boolean }[] }) {
  return (
    <nav className="ui-tabs" aria-label="Tabs">
      {items.map((item) => (
        <Link aria-current={item.active ? "page" : undefined} href={item.href} key={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
