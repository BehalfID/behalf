import styles from "@/app/home-v2/home-v2.module.css";
import { CheckIcon, XIcon } from "./icons";

const ALLOWED = ["github.pull_requests.read", "vercel.deployments.create", "vercel.deployments.read"];
const BLOCKED = ["github.repositories.delete", "vercel.projects.delete"];
const CONSTRAINTS = [
  { k: "Repositories", v: "Protected repositories only" },
  { k: "Production", v: "Deploys require approval" },
  { k: "Commands", v: "Destructive flags are denied" },
  { k: "Max amount", v: "$1,000 per transaction" },
  { k: "Required authority", v: "Engineering Lead" }
];

export function PermissionPolicyMockup() {
  return (
    <div className={styles.panel}>
      <div className={styles.profileHead}>
        <span className={styles.profileName}>
          Production Deployment Agent
          <span>Policy · applied to claude-code-production</span>
        </span>
      </div>

      <div className={styles.policyGroup}>
        <span className={styles.policyGroupHead}>Allowed actions</span>
        {ALLOWED.map((a) => (
          <div key={a} className={`${styles.policyLine} ${styles.policyLineAllow}`}>
            <span className={styles.policyIcon}>
              <CheckIcon size={14} strokeWidth={2.4} />
            </span>
            {a}
          </div>
        ))}
      </div>

      <div className={styles.policyGroup}>
        <span className={styles.policyGroupHead}>Blocked actions</span>
        {BLOCKED.map((a) => (
          <div key={a} className={`${styles.policyLine} ${styles.policyLineDeny}`}>
            <span className={styles.policyIcon}>
              <XIcon size={14} strokeWidth={2.4} />
            </span>
            {a}
          </div>
        ))}
      </div>

      <div className={`${styles.policyGroup} ${styles.policyGroupLast}`}>
        <span className={styles.policyGroupHead}>Constraints</span>
        {CONSTRAINTS.map((c) => (
          <div key={c.k} className={styles.constraint}>
            <strong>{c.k}:</strong>
            <span>{c.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
