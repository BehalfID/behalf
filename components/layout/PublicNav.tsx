import Link from "next/link";
import { ButtonLink, Logo, ThemeToggle } from "@/components/ui";

export function PublicNav() {
  return (
    <nav className="public-nav">
      <Logo />
      <div className="public-nav__links">
        <Link href="/docs">Docs</Link>
        <Link href="/blog">Blog</Link>
        <Link href="/security">Security</Link>
        <Link href="/login">Log in</Link>
        <ThemeToggle />
        <ButtonLink href="/signup" variant="primary">
          Start building
        </ButtonLink>
      </div>
    </nav>
  );
}
