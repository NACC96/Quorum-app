"use client";

import styles from "@/app/components/setup-step-progress.module.css";

export interface SetupStepProgressItem {
  id: string;
  label: string;
  description: string;
}

export interface SetupStepProgressProps {
  steps: SetupStepProgressItem[];
  currentStepId: string;
  completedStepIds: string[];
  onStepSelect?: (stepId: string) => void;
}

export default function SetupStepProgress({
  steps,
  currentStepId,
  completedStepIds,
  onStepSelect
}: SetupStepProgressProps): React.JSX.Element {
  const currentIndex = steps.findIndex((step) => step.id === currentStepId);

  return (
    <ol className={styles.progressList} aria-label="Setup progress">
      {steps.map((step, index) => {
        const isCurrent = step.id === currentStepId;
        const isComplete = completedStepIds.includes(step.id);
        const isSelectable = Boolean(onStepSelect) && (isComplete || index <= currentIndex);

        const itemClass = `${styles.progressItem} ${
          isCurrent ? styles.progressItemCurrent : isComplete ? styles.progressItemComplete : ""
        }`;

        return (
          <li key={step.id} className={itemClass}>
            {isSelectable ? (
              <button type="button" className={styles.progressButton} onClick={() => onStepSelect?.(step.id)}>
                <span className={styles.stepIndex}>{index + 1}</span>
                <span className={styles.stepCopy}>
                  <strong>{step.label}</strong>
                  <small>{step.description}</small>
                </span>
              </button>
            ) : (
              <div className={styles.progressLabel}>
                <span className={styles.stepIndex}>{index + 1}</span>
                <span className={styles.stepCopy}>
                  <strong>{step.label}</strong>
                  <small>{step.description}</small>
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
