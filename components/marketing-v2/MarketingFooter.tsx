import Link from "next/link";
import Image from "next/image";
import styles from "@/app/home-v2/home-v2.module.css";
import { FOOTER_GROUPS } from "./data";

export function MarketingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.footerGrid}>
          <div className={styles.footerBrand}>
            <Link href="/home-v2" className={styles.brand} aria-label="BehalfID home">
              <span className={styles.brandMark}>
                <Image src="/icon-transparent.png" alt="" width={20} height={20} />
              </span>
              <span>
                Behalf<span className={styles.brandSlash}>/</span>
                <span className={styles.brandId}>ID</span>
              </span>
            </Link>
            <p className={styles.footerTagline}>
              Identity, authorization, and approval control for AI agents. Decide what each agent may do — before it
              acts.
            </p>
          </div>

          {FOOTER_GROUPS.map((group) => (
            <div key={group.heading} className={styles.footerCol}>
              <h5>{group.heading}</h5>
              <ul>
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className={styles.footerBottom}>
          <span>© {new Date().getFullYear()} BehalfID</span>
          <span className={styles.footerStatus}>
            <span className={styles.footerStatusDot} />
            All systems operational
          </span>
        </div>
      </div>
    </footer>
  );
}
