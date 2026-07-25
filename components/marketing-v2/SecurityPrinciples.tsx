import styles from "@/app/home-v2/home-v2.module.css";
import { PRINCIPLES } from "./data";
import { ShieldIcon } from "./icons";

export function SecurityPrinciples() {
  return (
    <section className={`${styles.container} ${styles.section}`} aria-labelledby="principles-heading">
      <p className={styles.kicker}>Security principles</p>
      <h2 id="principles-heading" className={styles.h2}>
        Designed to enforce, not merely observe.
      </h2>
      <p className={styles.lede}>
        The enforcement model is deliberately conservative. These are the rules BehalfID applies to every decision.
      </p>

      <div className={styles.principleGrid}>
        {PRINCIPLES.map((p) => (
          <div key={p.title} className={styles.principle}>
            <span className={styles.principleIcon}>
              <ShieldIcon size={18} />
            </span>
            <p className={styles.principleText}>
              <strong>{p.title}.</strong> {p.text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
