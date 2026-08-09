"use client";

import { useState } from "react";
import { Check, Copy } from "./icons";
import { cn } from "@/lib/cn";

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      className={cn(
        "grid size-7 place-items-center rounded-md border bg-surface text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground",
        className,
      )}
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}

export function CodeTabs({
  tabs,
  className,
}: {
  tabs: { id: string; label: string; code: string; language?: string }[];
  className?: string;
}) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  if (!current) return null;
  return (
    <div className={cn("overflow-hidden rounded-lg border bg-surface", className)}>
      {/* The copy button stays outside the tablist: role="tablist" may only own tabs. */}
      <div className="flex items-center gap-1 border-b bg-surface-2 px-1.5 py-1">
        <div role="tablist" aria-label="Code examples" className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              id={`${t.id}-tab`}
              role="tab"
              aria-selected={t.id === current.id}
              aria-controls={`${t.id}-panel`}
              onClick={() => setActive(t.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                t.id === current.id && "bg-surface text-foreground shadow-subtle",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto pr-1">
          <CopyButton value={current.code} />
        </div>
      </div>
      <pre
        id={`${current.id}-panel`}
        role="tabpanel"
        aria-labelledby={`${current.id}-tab`}
        tabIndex={0}
        className="overflow-x-auto px-3 py-3 text-[12.5px] leading-relaxed"
      >
        <code>{current.code}</code>
      </pre>
    </div>
  );
}
