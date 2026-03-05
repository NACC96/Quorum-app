import styles from "@/app/components/footer.module.css";

export default function Footer(): React.JSX.Element {
  return (
    <footer className={styles.siteFooter}>
      <div className={styles.footerGrid}>
        <div>
          <h4 className={styles.footerBrand}>Quorum</h4>
          <p className={styles.footerCopy}>Council-style synthesis for high-stakes decisions.</p>
        </div>

        <div>
          <h5 className={styles.footerHeading}>Workflow</h5>
          <p className={styles.footerText}>Seed question, independent reasoning, deliberation, verdict.</p>
        </div>

        <div>
          <h5 className={styles.footerHeading}>Runtime</h5>
          <p className={styles.footerText}>OpenRouter gateway, local persistence, server-side API key handling.</p>
        </div>

        <div>
          <h5 className={styles.footerHeading}>Status</h5>
          <p className={styles.footerText}>Web-only v1 with configurable model councils.</p>
        </div>
      </div>

      <div className={styles.footerBar}>
        <span>&copy; {new Date().getFullYear()} Quorum</span>
        <span className={styles.statusOk}>
          <i aria-hidden /> All Systems Operational
        </span>
      </div>
    </footer>
  );
}
