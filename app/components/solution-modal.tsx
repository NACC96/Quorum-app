"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { JudgeSolution, ModelVote } from "@/lib/types";
import styles from "@/app/components/solution-modal.module.css";

interface SolutionModalProps {
  solution: JudgeSolution;
  allSolutions: JudgeSolution[];
  votes: ModelVote[];
  winningSolutionId: string | null;
  onClose: () => void;
  onNavigate: (solutionId: string) => void;
}

function focusablesWithin(element: HTMLElement): HTMLElement[] {
  return Array.from(
    element.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
    )
  );
}

export default function SolutionModal({
  solution,
  allSolutions,
  votes,
  winningSolutionId,
  onClose,
  onNavigate,
}: SolutionModalProps): React.JSX.Element {
  const headingId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const isWinner = winningSolutionId === solution.id;
  const solutionVotes = votes.filter((v) => v.chosenSolutionId === solution.id);
  const currentIndex = allSolutions.findIndex((s) => s.id === solution.id);
  const prevSolution = currentIndex > 0 ? allSolutions[currentIndex - 1] : null;
  const nextSolution = currentIndex < allSolutions.length - 1 ? allSolutions[currentIndex + 1] : null;

  useEffect(() => {
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const rafId = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowLeft" && prevSolution) {
        event.preventDefault();
        onNavigate(prevSolution.id);
        return;
      }

      if (event.key === "ArrowRight" && nextSolution) {
        event.preventDefault();
        onNavigate(nextSolution.id);
        return;
      }

      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusableElements = focusablesWithin(dialog);
      if (focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(rafId);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [onClose, onNavigate, prevSolution, nextSolution]);

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={`${styles.solutionBadge} ${isWinner ? styles.solutionBadgeWinner : ""}`}>
              {solution.label}
            </span>
            <h2 id={headingId} className={styles.title}>
              {isWinner ? "Winning Solution" : "Proposed Solution"}
            </h2>
          </div>

          {/* Solution nav tabs */}
          <div className={styles.navTabs}>
            {allSolutions.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`${styles.navTab} ${s.id === solution.id ? styles.navTabActive : ""} ${winningSolutionId === s.id ? styles.navTabWinner : ""}`}
                onClick={() => onNavigate(s.id)}
                aria-label={`View solution ${s.label}`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close solution modal"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          <div className={styles.descriptionSection}>
            <p className={styles.description}>{solution.description}</p>
          </div>

          {/* Voters */}
          {solutionVotes.length > 0 && (
            <div className={styles.votersSection}>
              <h3 className={styles.votersTitle}>
                {solutionVotes.length} vote{solutionVotes.length !== 1 ? "s" : ""} for this solution
              </h3>
              <div className={styles.votersList}>
                {solutionVotes.map((vote) => (
                  <div key={vote.modelId} className={styles.voterCard}>
                    <div className={styles.voterHeader}>
                      <span
                        className={styles.voterDot}
                        style={{ backgroundColor: vote.color }}
                        aria-hidden
                      />
                      <span className={styles.voterName}>{vote.modelName}</span>
                    </div>
                    <p className={styles.voterReasoning}>{vote.reasoning}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {votes.length > 0 && solutionVotes.length === 0 && (
            <div className={styles.noVotes}>
              <p>No models voted for this solution.</p>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.navButton}
            disabled={!prevSolution}
            onClick={() => prevSolution && onNavigate(prevSolution.id)}
            aria-label="Previous solution"
          >
            ← {prevSolution?.label ?? ""}
          </button>
          <span className={styles.navPosition}>
            {currentIndex + 1} of {allSolutions.length}
          </span>
          <button
            type="button"
            className={styles.navButton}
            disabled={!nextSolution}
            onClick={() => nextSolution && onNavigate(nextSolution.id)}
            aria-label="Next solution"
          >
            {nextSolution?.label ?? ""} →
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
