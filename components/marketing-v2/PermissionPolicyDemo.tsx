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

export function PermissionPolicyDemo() {
  return (
    <section className={`${styles.container} ${styles.section}`}>
      <div className={styles.split}>
        <div className={styles.splitText}>
          <p className={styles.kicker}>Permission policies</p>
          <h2 className={styles.h2}>Define precisely what each agent is allowed to do.</h2>
          <p className={styles.lede}>
            Permissions are more than an on/off switch. Scope an agent to specific actions, resources, and vendors, then
            layer on the constraints that make a policy safe in production.
          </p>
          <ul className={styles.featureList}>
            <li>
              <span className={styles.featureTick}>
                <CheckIcon size={17} strokeWidth={2.2} />
              </span>
              Explicit allow and block lists, evaluated per action
            </li>
            <li>
              <span className={styles.featureTick}>
                <CheckIcon size={17} strokeWidth={2.2} />
              </span>
              Resource, path, repository, and command constraints
            </li>
            <li>
              <span className={styles.featureTick}>
                <CheckIcon size={17} strokeWidth={2.2} />
              </span>
              Transaction limits and required authority levels
            </li>
          </ul>
        </div>

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

          <div className={styles.policyGroup} style={{ borderBottom: "none" }}>
            <span className={styles.policyGroupHead}>Constraints</span>
            {CONSTRAINTS.map((c) => (
              <div key={c.k} className={styles.constraint}>
                <strong>{c.k}:</strong>
                <span>{c.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
