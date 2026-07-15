import styles from "@/app/home-v2/home-v2.module.css";
import { LOG_ENTRIES } from "./data";
import { CheckIcon } from "./icons";

const DOT_CLASS: Record<string, string> = {
  allowed: styles.logDotAllow,
  denied: styles.logDotDeny,
  approval: styles.logDotWarn,
  neutral: styles.logDotNeutral
};

const STATE_LABEL: Record<string, string> = {
  allowed: "Allowed",
  denied: "Denied",
  approval: "Approval",
  neutral: "Revoked"
};

export function VerificationLogDemo() {
  return (
    <section className={`${styles.container} ${styles.section}`}>
      <div className={styles.split}>
        <div className={styles.splitText}>
          <p className={styles.kicker}>Verification logs</p>
          <h2 className={styles.h2}>Every decision leaves evidence.</h2>
          <p className={styles.lede}>
            BehalfID records the requesting agent, the attempted action, the matched policy, the decision, and the
            reason — with a stable request ID for every outcome.
          </p>
          <ul className={styles.featureList}>
            <li>
              <span className={styles.featureTick}>
                <CheckIcon size={17} strokeWidth={2.2} />
              </span>
              Allowed, denied, and approval-required decisions in one trail
            </li>
            <li>
              <span className={styles.featureTick}>
                <CheckIcon size={17} strokeWidth={2.2} />
              </span>
              Constraint mismatches and expired grants are recorded too
            </li>
            <li>
              <span className={styles.featureTick}>
                <CheckIcon size={17} strokeWidth={2.2} />
              </span>
              Useful to security, engineering, and audit teams alike
            </li>
          </ul>
        </div>

        <div className={styles.panel}>
          <div className={styles.profileHead}>
            <span className={styles.profileName}>
              Verification log
              <span>Live decision stream</span>
            </span>
          </div>
          {LOG_ENTRIES.map((entry, i) => (
            <div key={i} className={styles.logRow}>
              <span className={`${styles.logDot} ${DOT_CLASS[entry.state]}`} aria-hidden="true" />
              <span className={styles.logAction}>
                {entry.action}
                <span className={styles.sr}> — {STATE_LABEL[entry.state]}</span>
              </span>
              <span className={styles.logAgent}>{entry.agent}</span>
              <span className={styles.logTime}>{entry.detail} · {entry.time}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
