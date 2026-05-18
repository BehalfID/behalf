import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-footer__inner">
        <span className="public-footer__copy">© {new Date().getFullYear()} BehalfID</span>
        <nav className="public-footer__links" aria-label="Legal">
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/security">Security</Link>
        </nav>
      </div>
    </footer>
  );
}
