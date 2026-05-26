import Link from "next/link";
import { SocialLinks } from "@/components/ui";

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-footer__inner">
        <span className="public-footer__copy">© {new Date().getFullYear()} BehalfID</span>
        <nav className="public-footer__links" aria-label="Legal">
          <Link href="/legal">Legal</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/security">Security</Link>
          <Link href="/compliance">Compliance</Link>
        </nav>
        <SocialLinks className="social-links--footer" />
      </div>
    </footer>
  );
}
