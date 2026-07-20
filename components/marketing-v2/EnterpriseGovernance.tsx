import styles from "@/app/home-v2/home-v2.module.css";
import { ENTERPRISE_FEATURES } from "./data";
import { BuildingIcon, RouteIcon, LockIcon, ListIcon, ShieldIcon } from "./icons";

const ICONS: Record<string, typeof ShieldIcon> = {
  building: BuildingIcon,
  shield: ShieldIcon,
  route: RouteIcon,
  lock: LockIcon,
  list: ListIcon
};

export function EnterpriseGovernance() {
  return (
    <section id="enterprise" className={styles.dark} aria-labelledby="enterprise-heading">
      <div className={`${styles.container} ${styles.section}`}>
        <h2 id="enterprise-heading" className={styles.h2}>
          Govern AI agents from one control plane.
        </h2>
        <p className={styles.lede}>
          Centralize identities, permissions, approvals, and decision history across your organization.
        </p>

        <div className={styles.enterpriseGrid}>
          {ENTERPRISE_FEATURES.map((f) => {
            const Icon = ICONS[f.icon];
            return (
              <div key={f.title} className={styles.enterpriseCell}>
                <h3 className={styles.enterpriseCellTitle}>
                  <Icon size={18} />
                  {f.title}
                </h3>
                <p className={styles.enterpriseCellText}>{f.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
