"use client";

import { useEffect, useState } from "react";
import { useDeliberationContext } from "@/lib/deliberation-context";
import { HistorySkeleton } from "@/components/skeleton-loader";
import Link from "next/link";
import styles from "@/app/components/deliberation-history-panel.module.css";

export interface DeliberationHistoryPanelProps {
  activeSessionId?: string;
}

const MOBILE_BREAKPOINT_QUERY = "(max-width: 1140px)";

const PHASE_LABELS: Record<string, string> = {
  deliberating: "Deliberating",
  "user-turn": "Your Turn",
  judging: "Judging",
  voting: "Voting",
  complete: "Complete",
};

export default function DeliberationHistoryPanel({
  activeSessionId
}: DeliberationHistoryPanelProps): React.JSX.Element {
  const { deliberations, loading, error, removeDeliberation } = useDeliberationContext();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsCollapsed(event.matches);
    };

    setIsCollapsed(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  const requestDelete = (sessionId: string) => {
    const didConfirm = window.confirm("Delete this deliberation? This cannot be undone.");
    if (didConfirm) {
      removeDeliberation(sessionId);
    }
  };

  if (loading) {
    return (
      <aside className={styles.panel}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>Deliberations</h2>
            <p className={styles.count}>Loading...</p>
          </div>

          <button
            type="button"
            className={styles.toggleButton}
            onClick={() => setIsCollapsed((previous) => !previous)}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? "Expand deliberations list" : "Collapse deliberations list"}
          >
            {isCollapsed ? "Show" : "Hide"}
          </button>
        </header>

        {!isCollapsed && (
          <div className={styles.list}>
            <HistorySkeleton />
          </div>
        )}
      </aside>
    );
  }

  if (error) {
    return (
      <aside className={styles.panel}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>Deliberations</h2>
            <p className={styles.count}>Error loading deliberations</p>
          </div>

          <button
            type="button"
            className={styles.toggleButton}
            onClick={() => setIsCollapsed((previous) => !previous)}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? "Expand deliberations list" : "Collapse deliberations list"}
          >
            {isCollapsed ? "Show" : "Hide"}
          </button>
        </header>

        {!isCollapsed && (
          <div className={styles.list}>
            <p className={styles.empty}>Error: {error.message}</p>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside className={styles.panel}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Deliberations</h2>
          <p className={styles.count}>{deliberations.length} total</p>
        </div>

        <button
          type="button"
          className={styles.toggleButton}
          onClick={() => setIsCollapsed((previous) => !previous)}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "Expand deliberations list" : "Collapse deliberations list"}
        >
          {isCollapsed ? "Show" : "Hide"}
        </button>
      </header>

      {!isCollapsed && (
        <ul className={styles.list}>
          {deliberations.length === 0 && <li className={styles.empty}>No deliberations yet.</li>}

          {deliberations.map((session) => {
            const isActive = session.id === activeSessionId;
            const displayTitle = session.title ?? session.question;

            return (
              <li
                key={session.id}
                className={`${styles.item} ${isActive ? styles.itemActive : ""}`}
              >
                <Link href={`/deliberation/${session.id}`} className={styles.itemLink}>
                  <span className={styles.itemQuestion} title={displayTitle}>
                    {displayTitle}
                  </span>
                  <span className={styles.itemMeta}>
                    <span
                      className={`${styles.phaseBadge} ${
                        session.phase === "complete" ? styles.phaseBadgeComplete : ""
                      }`}
                    >
                      {PHASE_LABELS[session.phase] ?? session.phase}
                    </span>
                    <span>{session.settings.selectedModelIds.length} models</span>
                  </span>
                </Link>

                <div className={styles.itemActions}>
                  <Link
                    href={`/deliberation?from=${session.id}`}
                    className={styles.rerunButton}
                  >
                    Re-run
                  </Link>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={() => requestDelete(session.id)}
                    aria-label={`Delete ${displayTitle}`}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
