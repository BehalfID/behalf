import Link from "next/link";
import Image from "next/image";
import styles from "@/app/home-v2/home-v2.module.css";
import { FOOTER_LINKS } from "./data";

export function MarketingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.footerMain}>
          <Link href="/home-v2" className={styles.brand} aria-label="BehalfID home">
            <span className={styles.brandMark}>
              <Image src="/icon-transparent.png" alt="" width={20} height={20} />
            </span>
            <span>
              Behalf<span className={styles.brandSlash}>/</span>
              <span className={styles.brandId}>ID</span>
            </span>
          </Link>

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
