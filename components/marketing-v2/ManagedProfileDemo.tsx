import styles from "@/app/home-v2/home-v2.module.css";
import { Badge, Card } from "@/components/ui";
import { CheckIcon, XIcon, LockIcon } from "./icons";

const ALLOWED_TOOLS = ["Read", "Search", "Edit approved repositories"];
const PROTECTED = ["company/payments-api", "company/identity-service"];
const DENIED = ["Destructive shell commands", "Credential export", "Unapproved production access"];

export function ManagedProfileMockup() {
  return (
    <Card className={styles.panel}>
      <div className={styles.profileHead}>
        <span className={styles.profileName}>
          Enterprise Claude Code
          <span>Managed coding-agent profile</span>
        </span>
        <Badge className={`${styles.badge} ${styles.badgeAllow}`} variant="success">MODE · REQUIRED</Badge>
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
            <span className={`${styles.policyIcon} ${styles.policyIconCopper}`}>
              <LockIcon size={14} />
            </span>
            {r}
          </div>
        ))}
      </div>

      <div className={`${styles.policyGroup} ${styles.policyGroupLast}`}>
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
    </Card>
  );
}
