import Link from "next/link";
import { Logo } from "@/components/ui";
import styles from "@/app/home-v2/home-v2.module.css";
import { FOOTER_LINKS } from "./data";

export function MarketingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.footerMain}>
          <Logo className={styles.brand} href="/home-v2" markStyle="framed" />

          <nav aria-label="Footer">
            <ul className={styles.footerLinks}>
              {FOOTER_LINKS.map((link) => (
                <li key={link.label}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className={styles.footerBottom}>
          <span>© {new Date().getFullYear()} BehalfID</span>
        </div>
      </div>
    </footer>
  );
}
