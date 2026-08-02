"use client";

import type { CSSProperties, ReactNode } from "react";
import { useInView, usePrefersReducedMotion } from "@/hooks/use-motion";
import { cn } from "@/lib/cn";

/**
 * Single shared scroll reveal: a short rise + fade, once, on entry.
 * Under prefers-reduced-motion the final state renders immediately.
 */
export function Reveal({
  children,
  className,
  delay = 0
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, inView } = useInView(0.15);
  const reduced = usePrefersReducedMotion();
  const shown = reduced || inView;
  const style: CSSProperties | undefined =
    shown && !reduced ? { transitionDelay: `${delay}ms` } : undefined;

  return (
    <div ref={ref} className={cn(shown ? "reveal-shown" : "reveal-hidden", className)} style={style}>
      {children}
    </div>
  );
}

/** Marks mock product numbers as reference content, never measured results. */
export function IllustrativeTag({ className }: { className?: string }) {
  return <span className={cn("ds-tag", className)}>Illustrative</span>;
}

/** Roadmap / maturity marker for the adaptive engine. */
export function BetaTag({
  label = "Beta",
  className
}: {
  label?: string;
  className?: string;
}) {
  return <span className={cn("ds-tag ds-tag--beta", className)}>{label}</span>;
}
