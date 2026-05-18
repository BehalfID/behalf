import Link from "next/link";

interface SplitCTAButtonProps {
  buildHref: string;
  loginHref: string;
}

export function SplitCTAButton({ buildHref, loginHref }: SplitCTAButtonProps) {
  return (
    <div className="split-cta" role="group" aria-label="Primary actions">
      <Link href={buildHref} className="split-cta__half" aria-label="Build — create your account">
        Build
      </Link>
      <span className="split-cta__divider" aria-hidden="true" />
      <Link href={loginHref} className="split-cta__half" aria-label="Log in to your account">
        Log In
      </Link>
    </div>
  );
}
