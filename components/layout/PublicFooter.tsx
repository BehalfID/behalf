import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { SocialLinks } from "@/components/ui";

export function PublicFooter() {
  const t = useTranslations("footer");
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <Link
            href="/"
            className="site-footer__logo site-logo site-logo--full site-logo--framed"
            aria-label="BehalfID home"
          >
            <span className="site-logo__mark" aria-hidden="true">
              <Image src="/icon-transparent.png" alt="" width={26} height={26} className="site-logo__icon" />
            </span>
            <span className="site-logo__wordmark">
              <strong className="site-logo__text">
                Behalf<span className="site-logo__slash">/</span><span className="site-logo__id">ID</span>
              </strong>
            </span>
          </Link>
          <p className="site-footer__tagline">
            {t("tagline").split("\n").map((line, i) => (
              <span key={i}>{line}{i === 0 && <br />}</span>
            ))}
          </p>
          <p className="site-footer__copy">© {new Date().getFullYear()} BehalfID</p>
          <Link href="/status" className="site-footer__status">All systems operational</Link>
          <SocialLinks className="social-links--footer" />
        </div>
        <nav className="site-footer__cols" aria-label="Footer navigation">
          <div>
            <h5>{t("product")}</h5>
            <ul>
              <li><Link href="/sandbox">{t("sandbox")}</Link></li>
              <li><Link href="/design-partners">{t("designPartners")}</Link></li>
              <li><Link href="/security">{t("security")}</Link></li>
              <li><Link href="/blog">{t("blog")}</Link></li>
              <li><Link href="/signup">{t("startBuilding")}</Link></li>
            </ul>
          </div>
          <div>
            <h5>{t("docs")}</h5>
            <ul>
              <li><Link href="/docs/quickstart">{t("quickstart")}</Link></li>
              <li><Link href="/docs/deploy-approvals">{t("deployApprovals")}</Link></li>
              <li><Link href="/docs/cli">{t("cliMcp")}</Link></li>
              <li><Link href="/docs/api">{t("apiRef")}</Link></li>
              <li><Link href="/docs/sdk">{t("sdk")}</Link></li>
            </ul>
          </div>
          <div>
            <h5>{t("company")}</h5>
            <ul>
              <li><Link href="/design-system">{t("designSystem")}</Link></li>
              <li><Link href="/status">{t("status")}</Link></li>
              <li><Link href="/design-partners">{t("designPartners")}</Link></li>
            </ul>
          </div>
          <div>
            <h5>{t("legal")}</h5>
            <ul>
              <li><Link href="/legal">{t("legalHub")}</Link></li>
              <li><Link href="/terms">{t("terms")}</Link></li>
              <li><Link href="/privacy">{t("privacy")}</Link></li>
              <li><Link href="/security">{t("security")}</Link></li>
              <li><Link href="/compliance">{t("compliance")}</Link></li>
            </ul>
          </div>
        </nav>
      </div>
    </footer>
  );
}
