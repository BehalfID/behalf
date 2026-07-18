import styles from "@/app/home-v2/home-v2.module.css";
import { HOW_IT_WORKS } from "./data";
import { ArrowRightIcon } from "./icons";

export function HowItWorks() {
  return (
    <section id="how-it-works" className={`${styles.container} ${styles.section}`} aria-labelledby="how-heading">
      <p className={styles.kicker}>How it works</p>
      <h2 id="how-heading" className={styles.h2}>
        Identity, authority, and a decision before every action.
      </h2>

      <ol className={styles.stepsGrid}>
        {HOW_IT_WORKS.map((step, i) => (
          <li key={step.num} className={styles.step}>
            {i < HOW_IT_WORKS.length - 1 && (
              <span className={styles.stepArrow}>
                <ArrowRightIcon size={22} />
              </span>
            )}
            <span className={styles.stepNum}>{step.num}</span>
            <h3 className={styles.stepTitle}>{step.title}</h3>
            <p className={styles.stepText}>{step.text}</p>
            <div className={styles.chipList}>
              {step.chips.map((c) => (
                <span key={c} className={styles.chip}>
                  {c}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
