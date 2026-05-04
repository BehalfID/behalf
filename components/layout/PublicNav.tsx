import Link from "next/link";
import { ButtonLink, Logo } from "@/components/ui";

export function PublicNav() {
  return (
    <nav className="public-nav">
      <Logo />
      <div className="public-nav__links">
        <Link href="/docs">Docs</Link>
        <Link href="/security">Security</Link>
        <Link href="/login">Log in</Link>
        <ButtonLink href="/signup" variant="primary">
          Start building
        </ButtonLink>
      </div>
    </nav>
  );
}
