"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Session } from "@/lib/types";
import styles from "@/app/components/session-history-panel.module.css";

export interface SessionHistoryPanelProps {
  sessions: Session[];
  activeSessionId?: string;
  onDeleteSession: (sessionId: string) => void;
  getSessionHref?: (sessionId: string) => string;
  title?: string;
}

const MOBILE_BREAKPOINT_QUERY = "(max-width: 1140px)";

export default function SessionHistoryPanel({
  sessions,
  activeSessionId,
  onDeleteSession,
  getSessionHref = (sessionId) => `/session/${sessionId}`,
  title = "Sessions"
}: SessionHistoryPanelProps): React.JSX.Element {
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
    const didConfirm = window.confirm("Delete this session? This cannot be undone.");
    if (didConfirm) {
      onDeleteSession(sessionId);
    }
  };

  return (
    <aside className={styles.panel}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.count}>{sessions.length} total</p>
        </div>

        <button
          type="button"
          className={styles.toggleButton}
          onClick={() => setIsCollapsed((previous) => !previous)}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "Expand sessions list" : "Collapse sessions list"}
        >
          {isCollapsed ? "Show" : "Hide"}
        </button>
      </header>

      {!isCollapsed && (
        <ul className={styles.list}>
          {sessions.length === 0 && <li className={styles.empty}>No sessions yet.</li>}

          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const displayTitle = session.title ?? session.question;

            return (
              <li
                key={session.id}
                className={`${styles.item} ${isActive ? styles.itemActive : ""}`}
              >
                <Link href={getSessionHref(session.id)} className={styles.itemLink}>
                  <span className={styles.itemQuestion} title={displayTitle}>
                    {displayTitle}
                  </span>
                  <span className={styles.itemMeta}>
                    {session.settings.selectedModelIds.length} models · {session.status}
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
