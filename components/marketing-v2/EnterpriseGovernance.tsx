import styles from "@/app/home-v2/home-v2.module.css";
import { ENTERPRISE_FEATURES } from "./data";
import { BuildingIcon, RouteIcon, LockIcon, ListIcon, ShieldIcon, LayersIcon } from "./icons";

const ICONS: Record<string, typeof ShieldIcon> = {
  building: BuildingIcon,
  route: RouteIcon,
  lock: LockIcon,
  list: ListIcon,
  shield: ShieldIcon,
  layers: LayersIcon
};

export function EnterpriseGovernance() {
  return (
    <section className={styles.dark} aria-labelledby="enterprise-heading">
      <div className={`${styles.container} ${styles.section}`}>
        <p className={styles.kicker}>Enterprise governance</p>
        <h2 id="enterprise-heading" className={styles.h2}>
          Agent governance for organizations, not just individual developers.
        </h2>
        <p className={styles.lede}>
          Manage identities, permissions, approvals, and audit trails across your whole organization from a single
          control plane — with delegated authority and protected resources.
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
