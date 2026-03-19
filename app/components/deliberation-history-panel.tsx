"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DeliberationSession } from "@/lib/types";
import styles from "@/app/components/deliberation-history-panel.module.css";

export interface DeliberationHistoryPanelProps {
  sessions: DeliberationSession[];
  activeSessionId?: string;
  onDeleteSession: (sessionId: string) => void;
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
  sessions,
  activeSessionId,
  onDeleteSession,
}: DeliberationHistoryPanelProps): React.JSX.Element {
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
      onDeleteSession(sessionId);
    }
  };

  return (
    <aside className={styles.panel}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Deliberations</h2>
          <p className={styles.count}>{sessions.length} total</p>
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
          {sessions.length === 0 && <li className={styles.empty}>No deliberations yet.</li>}

          {sessions.map((session) => {
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

                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => requestDelete(session.id)}
                  aria-label={`Delete ${displayTitle}`}
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
