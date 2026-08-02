import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Consistent marketing page section wrapper. */
export function Section({
  children,
  className,
  id,
  bleed,
  wide
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  bleed?: boolean;
  wide?: boolean;
}) {
  return (
    <section id={id} className={className}>
      <div
        className={cn(
          wide ? "ds-section ds-section--wide" : "ds-section",
          bleed ? "ds-section--bleed" : null
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  className
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ds-section-heading", className)}>
      {eyebrow ? <div className="ds-section-heading__eyebrow">{eyebrow}</div> : null}
      <h2 className="display-lg ds-section-heading__title">{title}</h2>
      {description ? <p className="ds-section-heading__description">{description}</p> : null}
    </div>
  );
}
