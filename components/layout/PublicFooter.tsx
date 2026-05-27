import Link from "next/link";
import { SocialLinks } from "@/components/ui";

export function PublicFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <Link href="/" className="site-footer__logo">
            Behalf<span>ID</span>
          </Link>
          <p className="site-footer__tagline">
            Permission infrastructure<br />for AI agents.
          </p>
          <p className="site-footer__copy">© {new Date().getFullYear()} BehalfID</p>
          <SocialLinks className="social-links--footer" />
        </div>
        <nav className="site-footer__cols" aria-label="Footer navigation">
          <div>
            <h5>Product</h5>
            <ul>
              <li><Link href="/sandbox">Sandbox</Link></li>
              <li><Link href="/design-partners">Design partners</Link></li>
              <li><Link href="/security">Security</Link></li>
              <li><Link href="/blog">Blog</Link></li>
              <li><Link href="/signup">Start building</Link></li>
            </ul>
          </div>
          <div>
            <h5>Docs</h5>
            <ul>
              <li><Link href="/docs/quickstart">Quickstart</Link></li>
              <li><Link href="/docs/deploy-approvals">Deploy approvals</Link></li>
              <li><Link href="/docs/cli">CLI &amp; MCP</Link></li>
              <li><Link href="/docs/api">API reference</Link></li>
              <li><Link href="/docs/sdk">SDK</Link></li>
            </ul>
          </div>
          <div>
            <h5>Company</h5>
            <ul>
              <li><Link href="/design-system">Design system</Link></li>
              <li><Link href="/status">Status</Link></li>
              <li><Link href="/design-partners">Design partners</Link></li>
            </ul>
          </div>
          <div>
            <h5>Legal</h5>
            <ul>
              <li><Link href="/legal">Legal hub</Link></li>
              <li><Link href="/terms">Terms of Service</Link></li>
              <li><Link href="/privacy">Privacy policy</Link></li>
              <li><Link href="/security">Security</Link></li>
              <li><Link href="/compliance">Compliance</Link></li>
            </ul>
          </div>
        </nav>
      </div>
    </footer>
  );
}
