import Link from "next/link";

interface SplitCTAButtonProps {
  leftLabel: string;
  leftHref: string;
  rightLabel: string;
  rightHref: string;
  className?: string;
}

export function SplitCTAButton({
  leftLabel,
  leftHref,
  rightLabel,
  rightHref,
  className,
}: SplitCTAButtonProps) {
  const isGhost = className?.includes("ghost");
  return (
    <div className="cta-pair" role="group" aria-label="Primary actions">
      <Link
        href={leftHref}
        className={isGhost ? "home-cta-secondary" : "home-cta-primary"}
      >
        {leftLabel}
      </Link>
      <Link
        href={rightHref}
        className="home-cta-secondary"
      >
        {rightLabel}
      </Link>
    </div>
  );
}
