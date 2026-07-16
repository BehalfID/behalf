import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from "react";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Tabs({
  items,
  label = "Tabs",
  className
}: {
  items: { href: string; label: string; active?: boolean }[];
  label?: string;
  className?: string;
}) {
  return (
    <nav className={classNames("ui-tabs", className)} aria-label={label}>
      {items.map((item) => (
        <Link aria-current={item.active ? "page" : undefined} href={item.href} key={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function TabList({
  className,
  label,
  unstyled = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { label: string; unstyled?: boolean }) {
  return (
    <div
      aria-label={label}
      className={classNames(!unstyled && "ui-tab-list", className)}
      role="tablist"
      {...props}
    />
  );
}

export const Tab = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean; unstyled?: boolean }
>(function Tab({ className, selected, unstyled = false, ...props }, ref) {
  return (
    <button
      aria-selected={selected}
      className={classNames(!unstyled && "ui-tab", className)}
      ref={ref}
      role="tab"
      tabIndex={selected ? 0 : -1}
      type="button"
      {...props}
    />
  );
});

export function TabPanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={classNames("ui-tab-panel", className)}
      role="tabpanel"
      tabIndex={0}
      {...props}
    />
  );
}
