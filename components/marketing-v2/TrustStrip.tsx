import styles from "@/app/home-v2/home-v2.module.css";
import { TRUST_ITEMS } from "./data";
import { LockIcon, PauseIcon, KeyIcon, ListIcon } from "./icons";

const ICONS = [LockIcon, PauseIcon, KeyIcon, ListIcon];

export function TrustStrip() {
  return (
    <section className={styles.trust} aria-label="Core capabilities">
      <div className={styles.container}>
        <div className={styles.trustGrid}>
          {TRUST_ITEMS.map((item, i) => {
            const Icon = ICONS[i];
            return (
              <div key={item.title} className={styles.trustItem}>
                <div className={styles.trustIcon}>
                  <Icon size={22} />
                </div>
                <h3 className={styles.trustTitle}>{item.title}</h3>
                <p className={styles.trustText}>{item.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
