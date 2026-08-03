import Link from "next/link";
import { cn } from "@/lib/cn";

/** Behalf/ID wordmark. The slash is the brand's structural device. */
export function Wordmark({
  className,
  href = "/",
  as = "link",
}: {
  className?: string;
  href?: string;
  as?: "link" | "text";
}) {
  const content = (
    <span className={cn("inline-flex items-baseline text-[15px] font-semibold tracking-tight", className)}>
      <span>Behalf</span>
      <span className="px-px text-primary" aria-hidden>
        /
      </span>
      <span>ID</span>
    </span>
  );
  if (as === "text") return content;
  return (
    <Link href={href} className="rounded-sm" aria-label="BehalfID home">
      {content}
    </Link>
  );
}

/** Compact brand mark: a slashed square. Used in sidebars and avatars. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md border border-primary/40 bg-primary-soft text-[13px] font-semibold text-primary",
        className,
      )}
    >
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
  github: "GH",
};

/** Agent identity mark — initials/provider glyph, never a cartoon robot. */
export function AgentAvatar({
  name,
  provider,
  size = "md",
  className,
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

  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-md border bg-surface-2 font-mono font-medium text-muted-foreground",
        size === "sm" && "size-6 text-[10px]",
        size === "md" && "size-8 text-[11px]",
        size === "lg" && "size-11 text-sm",
        className,
      )}
    >
      {glyph}
    </span>
  );
}

/** Keyboard shortcut hint. */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-surface-2 px-1 text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}
