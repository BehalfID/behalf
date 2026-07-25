import styles from "@/app/home-v2/home-v2.module.css";

const PROBLEM_POINTS = [
  "Credentials are broader than authority.",
  "Monitoring happens after execution.",
  "Prompts are guidance, not enforcement."
] as const;

export function ProblemSection() {
  return (
    <section className={`${styles.container} ${styles.section} ${styles.problemSection}`}>
      <h2 className={styles.h2}>Credentials provide access. They do not define authority.</h2>
      <p className={styles.lede}>
        Credentials open the system. They cannot decide whether a specific agent should perform a specific action.
      </p>

      <ul className={styles.problemList}>
        {PROBLEM_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </section>
  );
}
