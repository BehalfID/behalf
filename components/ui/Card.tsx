import type { HTMLAttributes, ReactNode } from "react";

export type SurfaceVariant = "default" | "elevated" | "muted" | "inset" | "dark";
export type SurfacePadding = "none" | "small" | "medium" | "large";

function surfaceClasses(
  base: "ui-card" | "ui-panel",
  variant: SurfaceVariant,
  padding: SurfacePadding,
  className?: string
) {
  return [
    base,
    variant !== "default" ? `${base}--${variant}` : undefined,
    padding !== "none" ? `${base}--padding-${padding}` : undefined,
    className
  ]
    .filter(Boolean)
    .join(" ");
}

export function Card({
  className,
  variant = "default",
  padding = "none",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: SurfaceVariant;
  padding?: SurfacePadding;
}) {
  return (
    <div
      className={surfaceClasses("ui-card", variant, padding, className)}
      {...props}
    />
  );
}

export function Panel({
  className,
  variant = "default",
  padding = "medium",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: SurfaceVariant;
  padding?: SurfacePadding;
}) {
  return (
    <div
      className={surfaceClasses("ui-panel", variant, padding, className)}
      {...props}
    />
  );
}

export function InsetPanel(props: Omit<Parameters<typeof Panel>[0], "variant">) {
  return <Panel variant="inset" {...props} />;
}

export function DarkPanel(props: Omit<Parameters<typeof Panel>[0], "variant">) {
  return <Panel variant="dark" {...props} />;
}

export function PageSection({
  children,
  className,
  innerClassName,
  spacing = "default",
  width = "content",
  ...props
}: HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  innerClassName?: string;
  spacing?: "default" | "compact";
  width?: "content" | "wide";
}) {
  return (
    <section
      className={[
        "ui-page-section",
        spacing === "compact" ? "ui-page-section--compact" : undefined,
        width === "wide" ? "ui-page-section--wide" : undefined,
        className
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      <div className={["ui-page-section__inner", innerClassName].filter(Boolean).join(" ")}>
        {children}
      </div>
    </section>
  );
}
