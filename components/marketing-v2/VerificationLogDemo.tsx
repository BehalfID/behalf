import styles from "@/app/home-v2/home-v2.module.css";
import { LOG_ENTRIES } from "./data";

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

export function VerificationLogMockup() {
  return (
    <div className={styles.panel}>
      <div className={styles.profileHead}>
        <span className={styles.profileName}>
          Verification log
          <span>Live decision stream</span>
        </span>
      </div>
      {LOG_ENTRIES.map((entry) => (
        <div key={`${entry.action}-${entry.time}`} className={styles.logRow}>
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
  );
}
