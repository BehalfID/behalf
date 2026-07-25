import styles from "@/app/home-v2/home-v2.module.css";
import { COMPARISON } from "./data";

export function AuthorizationComparison() {
  return (
    <section className={`${styles.container} ${styles.section}`} aria-labelledby="compare-heading">
      <p className={styles.kicker}>Where it fits</p>
      <h2 id="compare-heading" className={styles.h2}>
        Related tools answer different questions.
      </h2>
      <p className={styles.lede}>
        Monitoring, prompt filtering, and credential management each solve part of the problem. BehalfID decides
        authority before the action runs.
      </p>

      <div className={styles.compareGrid}>
        {COMPARISON.map((c) => (
          <div key={c.label} className={`${styles.compareCard} ${c.active ? styles.compareCardActive : ""}`}>
            <p className={styles.compareLabel}>{c.label}</p>
            <p className={styles.compareText}>{c.text}</p>
            <span className={styles.compareTiming}>{c.timing}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
