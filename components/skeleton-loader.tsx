import styles from "@/app/components/history-skeleton.module.css";

export function HistorySkeleton() {
  return (
    <ul className={styles.list}>
      {[1, 2, 3, 4, 5].map((i) => (
        <li key={i} className={styles.skeletonItem}>
          <div className={styles.shimmerLine} style={{ width: "70%" }} />
          <div className={styles.shimmerLine} style={{ width: "45%", height: "0.7rem" }} />
        </li>
      ))}
    </ul>
  );
}
