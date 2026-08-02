import Link from "next/link";
import { cn } from "@/lib/cn";

/** Behalf/ID wordmark. The slash is the brand's structural device. */
export function Wordmark({
  className,
  href = "/",
  as = "link"
}: {
  className?: string;
  href?: string;
  as?: "link" | "text";
}) {
  const content = (
    <span className={cn("ds-wordmark", className)}>
      <span>Behalf</span>
      <span className="ds-wordmark__slash" aria-hidden>
        /
      </span>
      <span>ID</span>
    </span>
  );
  if (as === "text") return content;
  return (
    <Link href={href} aria-label="BehalfID home" style={{ textDecoration: "none", color: "inherit" }}>
      {content}
    </Link>
  );
}

/** Compact brand mark: a slashed square. Used in sidebars and avatars. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("ds-brand-mark", className)}>
      /
    </span>
  );
}

const providerGlyph: Record<string, string> = {
  cursor: "CU",
  "claude-code": "CC",
  codex: "CX",
  mcp: "MC",
  custom: "AG",
  github: "GH"
};

/** Agent identity mark — initials/provider glyph, never a cartoon robot. */
export function AgentAvatar({
  name,
  provider,
  size = "md",
  className
}: {
  name: string;
  provider?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const glyph =
    (provider && providerGlyph[provider]) ??
    name
      .split(/[\s-_]+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();

  const dim = size === "sm" ? "1.5rem" : size === "lg" ? "2.25rem" : "1.875rem";
  const fontSize = size === "sm" ? "10px" : size === "lg" ? "12px" : "11px";

  return (
    <span
      aria-hidden
      className={cn("ds-brand-mark", className)}
      style={{
        width: dim,
        height: dim,
        fontSize,
        fontFamily: "var(--font-ds-mono)",
        borderColor: "var(--color-border)",
        background: "var(--color-surface-2)",
        color: "var(--color-muted-foreground)"
      }}
    >
      {glyph}
    </span>
  );
}
