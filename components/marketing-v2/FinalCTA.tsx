import Link from "next/link";
import styles from "@/app/home-v2/home-v2.module.css";
import { ArrowRightIcon } from "./icons";

export function FinalCTA() {
  return (
    <section className={`${styles.container} ${styles.section}`}>
      <div className={styles.finalCta}>
        <p className={styles.finalQuote}>
          Your agents already have access. <em>BehalfID determines whether they have authority.</em>
        </p>
        <p className={styles.finalSub}>
          Give every agent an identity, define its permissions, and require approval before sensitive actions are
          executed.
        </p>
        <div className={styles.finalActions}>
          <Link href="/signup" className={styles.btnPrimary}>
            Start securing agents
            <ArrowRightIcon size={16} />
          </Link>
          <Link href="/docs/concepts" className={styles.btnSecondary}>
            Read the technical overview
          </Link>
        </div>
      </div>
    </section>
  );
}
