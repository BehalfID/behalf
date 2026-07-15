import styles from "@/app/home-v2/home-v2.module.css";
import { CheckIcon, XIcon, LockIcon } from "./icons";

const ALLOWED_TOOLS = ["Read", "Search", "Edit approved repositories"];
const PROTECTED = ["company/payments-api", "company/identity-service"];
const DENIED = ["Destructive shell commands", "Credential export", "Unapproved production access"];

export function ManagedProfileDemo() {
  return (
    <section className={`${styles.container} ${styles.section}`}>
      <div className={`${styles.split} ${styles.splitReverse}`}>
        <div className={styles.panel}>
          <div className={styles.profileHead}>
            <span className={styles.profileName}>
              Enterprise Claude Code
              <span>Managed coding-agent profile</span>
            </span>
            <span className={`${styles.badge} ${styles.badgeAllow}`}>MODE · REQUIRED</span>
          </div>

          <div className={styles.policyGroup}>
            <span className={styles.policyGroupHead}>Allowed tools</span>
            {ALLOWED_TOOLS.map((t) => (
              <div key={t} className={`${styles.policyLine} ${styles.policyLineAllow}`}>
                <span className={styles.policyIcon}>
                  <CheckIcon size={14} strokeWidth={2.4} />
                </span>
                {t}
              </div>
            ))}
          </div>

          <div className={styles.policyGroup}>
            <span className={styles.policyGroupHead}>Protected repositories</span>
            {PROTECTED.map((r) => (
              <div key={r} className={styles.policyLine}>
                <span className={styles.policyIcon} style={{ color: "var(--v2-copper-strong)" }}>
                  <LockIcon size={14} />
                </span>
                {r}
              </div>
            ))}
          </div>

          <div className={styles.policyGroup} style={{ borderBottom: "none" }}>
            <span className={styles.policyGroupHead}>Denied commands</span>
            {DENIED.map((d) => (
              <div key={d} className={`${styles.policyLine} ${styles.policyLineDeny}`}>
                <span className={styles.policyIcon}>
                  <XIcon size={14} strokeWidth={2.4} />
                </span>
                {d}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.splitText}>
          <p className={styles.kicker}>Managed profiles</p>
          <h2 className={styles.h2}>Apply enforceable controls to coding agents.</h2>
          <p className={styles.lede}>
            Manage coding-agent policies as reusable profiles: which tools are allowed, which repositories are
            protected, which commands are denied, and which enforcement mode applies.
          </p>
          <ul className={styles.featureList}>
            <li>
              <span className={styles.featureTick}>
                <CheckIcon size={17} strokeWidth={2.2} />
              </span>
              Allowed tools, protected repositories, and denied commands
            </li>
            <li>
              <span className={styles.featureTick}>
                <CheckIcon size={17} strokeWidth={2.2} />
              </span>
              Required enforcement mode with activity visibility
            </li>
            <li>
              <span className={styles.featureTick}>
                <CheckIcon size={17} strokeWidth={2.2} />
              </span>
              Applies to Claude Code, Codex, and Cursor at the tool boundary
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
