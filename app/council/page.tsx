import { Suspense } from "react";
import NavPill from "@/app/components/nav-pill";
import Footer from "@/app/components/footer";
import CouncilPageClient from "@/app/council/council-page-client";
import styles from "@/app/council/council-page.module.css";

function CouncilPageFallback(): React.JSX.Element {
  return (
    <div className="synapse-root">
      <div className="ambient-orb ambient-orb-violet" aria-hidden />
      <div className="ambient-orb ambient-orb-cyan" aria-hidden />
      <NavPill variant="app" />

      <main className="main-shell">
        <section className={styles.loadingFallback} aria-live="polite">
          Loading council workspace...
        </section>
      </main>

      <Footer />
    </div>
  );
}

export default function CouncilPage(): React.JSX.Element {
  return (
    <Suspense fallback={<CouncilPageFallback />}>
      <CouncilPageClient />
    </Suspense>
  );
}
