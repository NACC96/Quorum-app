import Link from "next/link";
import styles from "@/app/components/nav-pill.module.css";

interface NavPillProps {
  variant?: "landing" | "app";
}

export default function NavPill({ variant = "landing" }: NavPillProps): React.JSX.Element {
  return (
    <header className={styles.navPill}>
      <div className={styles.brandWrap}>
        <Link href="/" className={styles.brandLink}>
          <span className={styles.brandDot} aria-hidden />
          <span className={styles.brandTitle}>Quorum</span>
        </Link>
      </div>

      <nav className={styles.navLinks} aria-label="Primary">
        {variant === "landing" ? (
          <a href="#features" className={styles.navLink}>
            Features
          </a>
        ) : (
          <>
            <Link href="/council" className={styles.navLink}>
              Council
            </Link>
            <Link href="/" className={styles.navLink}>
              Home
            </Link>
          </>
        )}
      </nav>

      <Link href="/council" className={styles.navCta}>
        Convene
      </Link>
    </header>
  );
}
