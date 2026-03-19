import { Suspense } from "react";
import NavPill from "@/app/components/nav-pill";
import Footer from "@/app/components/footer";
import DeliberationSetupClient from "@/app/deliberation/deliberation-setup-client";
import styles from "@/app/deliberation/deliberation-setup.module.css";

function DeliberationPageFallback(): React.JSX.Element {
  return (
    <div className="synapse-root">
      <div className="ambient-orb ambient-orb-violet" aria-hidden />
      <div className="ambient-orb ambient-orb-cyan" aria-hidden />
      <NavPill variant="app" />

      <main className="main-shell">
        <section className={styles.loadingFallback} aria-live="polite">
          Loading deliberation setup...
        </section>
      </main>

      <Footer />
    </div>
  );
}

export default function DeliberationPage(): React.JSX.Element {
  return (
    <Suspense fallback={<DeliberationPageFallback />}>
      <DeliberationSetupClient />
    </Suspense>
  );
}
