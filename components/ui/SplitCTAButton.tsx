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
  const cls = ["split-cta", className].filter(Boolean).join(" ");
  return (
    <div className={cls} role="group" aria-label="Primary actions">
      <Link href={leftHref} className="split-cta__half split-cta__half--left">
        {leftLabel}
      </Link>
      <Link href={rightHref} className="split-cta__half split-cta__half--right">
        {rightLabel}
      </Link>
    </div>
  );
}
