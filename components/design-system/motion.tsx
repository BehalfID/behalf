"use client";

import type { ElementType, ReactNode } from "react";
import { useInView, usePrefersReducedMotion } from "@/hooks/use-motion";
import { cn } from "@/lib/cn";

/**
 * Single shared scroll reveal: a short rise + fade, once, on entry.
 * Under prefers-reduced-motion the final state renders immediately.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: ElementType;
}) {
  const { ref, inView } = useInView(0.15);
  const reduced = usePrefersReducedMotion();
  const shown = reduced || inView;

  return (
    <As
      ref={ref}
      className={cn(shown ? "reveal-shown" : "reveal-hidden", className)}
      style={shown && !reduced ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </As>
  );
}

/** Marks mock product numbers as reference content, never measured results. */
export function IllustrativeTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground",
        className,
      )}
    >
      Illustrative
    </span>
  );
}

/** Roadmap / maturity marker for the adaptive engine. */
export function BetaTag({ label = "Beta", className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-primary-soft px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary",
        className,
      )}
    >
      {label}
    </span>
  );
}
