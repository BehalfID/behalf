import styles from "@/app/home-v2/home-v2.module.css";
import { PROBLEMS } from "./data";

export function ProblemSection() {
  return (
    <section className={`${styles.container} ${styles.section}`}>
      <p className={styles.kicker}>The gap</p>
      <h2 className={styles.h2}>Credentials provide access. They do not define authority.</h2>
      <p className={styles.lede}>
        A key or token answers whether an agent <em>can</em> reach a system. It does not answer whether the agent is
        authorized to perform a specific action against it. That distinction is where things go wrong.
      </p>

      <div className={styles.problemGrid}>
        {PROBLEMS.map((p) => (
          <div key={p.num} className={styles.problemCard}>
            <span className={styles.problemCardNum}>{p.num}</span>
            <h3 className={styles.problemCardTitle}>{p.title}</h3>
            <p className={styles.problemCardText}>{p.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
