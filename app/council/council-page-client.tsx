"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_COUNCIL,
  DEFAULT_JUDGE,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_SUMMARY_MODEL,
  MAX_COUNCIL_SIZE,
  MAX_DELIBERATION_ROUNDS,
  MIN_COUNCIL_SIZE,
  MODEL_OPTIONS,
  REASONING_EFFORT_OPTIONS,
  getModelById,
  getModelsByIds
} from "@/lib/models";
import { DraftState, ReasoningEffort } from "@/lib/types";
import { useSessionsContext } from "@/lib/sessions-context";
import { createId } from "@/lib/council-engine";
import { getEstimatedModelCallCount, getExpectedRoundCount } from "@/lib/format";
import NavPill from "@/app/components/nav-pill";
import Footer from "@/app/components/footer";
import ModelPickerModal from "@/app/components/model-picker-modal";
import SessionHistoryPanel from "@/app/components/session-history-panel";
import SetupStepProgress, { SetupStepProgressItem } from "@/app/components/setup-step-progress";
import styles from "@/app/council/council-page.module.css";

type SetupStepId = "prompt" | "council" | "judge" | "review";

const SETUP_STEPS: SetupStepProgressItem[] = [
  {
    id: "prompt",
    label: "Prompt",
    description: "Question and context"
  },
  {
    id: "council",
    label: "Council",
    description: "Members and thinking levels"
  },
  {
    id: "judge",
    label: "Judge & Rounds",
    description: "Judge model and cycle depth"
  },
  {
    id: "review",
    label: "Review",
    description: "Validate and convene"
  }
];

const STEP_ORDER: SetupStepId[] = ["prompt", "council", "judge", "review"];

const INITIAL_DRAFT: DraftState = {
  question: "",
  context: "",
  councilSize: DEFAULT_COUNCIL.length,
  councilSlots: DEFAULT_COUNCIL.map((id) => id),
  councilReasoningEfforts: {},
  judgeModelId: DEFAULT_JUDGE,
  judgeReasoningEffort: DEFAULT_REASONING_EFFORT,
  deliberationRounds: 0,
  summaryEnabled: false,
  summaryModelId: DEFAULT_SUMMARY_MODEL,
  summaryReasoningEffort: DEFAULT_REASONING_EFFORT
};

function getStepIndex(step: SetupStepId): number {
  return STEP_ORDER.indexOf(step);
}

export default function CouncilPageClient(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sessions, addSession, removeSession, getSession } = useSessionsContext();

  const fromSessionId = searchParams.get("from");

  const initialDraft = useMemo<DraftState>(() => {
    if (!fromSessionId) {
      return INITIAL_DRAFT;
    }

    const source = getSession(fromSessionId);
    if (!source) {
      return INITIAL_DRAFT;
    }

    const modelIds = source.settings.selectedModelIds;
    const effortMap: Record<number, ReasoningEffort> = {};

    if (source.settings.reasoningEffortMap) {
      modelIds.forEach((modelId, index) => {
        const effort = source.settings.reasoningEffortMap?.[modelId];
        if (effort) {
          effortMap[index] = effort;
        }
      });
    }

    return {
      question: source.question,
      context: source.context,
      councilSize: modelIds.length,
      councilSlots: [...modelIds],
      councilReasoningEfforts: effortMap,
      judgeModelId: source.settings.judgeModelId,
      judgeReasoningEffort: source.settings.judgeReasoningEffort ?? DEFAULT_REASONING_EFFORT,
      deliberationRounds: source.settings.deliberationRounds,
      summaryEnabled: source.settings.summaryEnabled ?? false,
      summaryModelId: source.settings.summaryModelId ?? DEFAULT_SUMMARY_MODEL,
      summaryReasoningEffort: source.settings.summaryReasoningEffort ?? DEFAULT_REASONING_EFFORT
    };
  }, [fromSessionId, getSession]);

  const [draft, setDraft] = useState<DraftState>(initialDraft);
  const [currentStep, setCurrentStep] = useState<SetupStepId>("prompt");
  const [completedSteps, setCompletedSteps] = useState<SetupStepId[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [pickerSlotIndex, setPickerSlotIndex] = useState<number | null>(null);

  useEffect(() => {
    setDraft(initialDraft);
    setCurrentStep("prompt");
    setCompletedSteps([]);
    setErrorMessage("");
  }, [initialDraft]);

  const currentStepIndex = getStepIndex(currentStep);
  const totalRoundsForDraft = getExpectedRoundCount(draft.deliberationRounds, draft.summaryEnabled);
  const estimatedModelCalls = getEstimatedModelCallCount(
    draft.councilSize,
    draft.deliberationRounds,
    draft.summaryEnabled
  );

  const isPromptStepValid = draft.question.trim().length > 0;
  const isCouncilStepValid =
    draft.councilSlots.length >= MIN_COUNCIL_SIZE &&
    draft.councilSlots.every((slot) => slot !== null);
  const isJudgeStepValid =
    Boolean(getModelById(draft.judgeModelId)) &&
    (!draft.summaryEnabled || Boolean(getModelById(draft.summaryModelId)));
  const canRun = isPromptStepValid && isCouncilStepValid && isJudgeStepValid;

  const assignedCouncilModels = draft.councilSlots.map((modelId, index) => ({
    index,
    model: modelId ? getModelById(modelId) : null,
    effort: draft.councilReasoningEfforts[index] ?? DEFAULT_REASONING_EFFORT
  }));

  const judgeModel = getModelById(draft.judgeModelId);
  const summaryModel = getModelById(draft.summaryModelId);

  const canProceedFromStep = (step: SetupStepId): boolean => {
    if (step === "prompt") {
      return isPromptStepValid;
    }

    if (step === "council") {
      return isCouncilStepValid;
    }

    if (step === "judge") {
      return isJudgeStepValid;
    }

    return canRun;
  };

  const validationMessageForStep = (step: SetupStepId): string => {
    if (step === "prompt") {
      return "Add a question before moving to council configuration.";
    }

    if (step === "council") {
      return "Assign a model to each council slot before continuing.";
    }

    if (step === "judge") {
      return draft.summaryEnabled
        ? "Select valid judge and summary models to continue."
        : "Select a valid judge model to continue.";
    }

    return "Resolve setup issues before convening council.";
  };

  const markStepComplete = (step: SetupStepId) => {
    setCompletedSteps((previous) => (previous.includes(step) ? previous : [...previous, step]));
  };

  const goToStep = (step: SetupStepId) => {
    setCurrentStep(step);
    setErrorMessage("");
  };

  const handleNextStep = () => {
    if (!canProceedFromStep(currentStep)) {
      setErrorMessage(validationMessageForStep(currentStep));
      return;
    }

    markStepComplete(currentStep);

    const nextStep = STEP_ORDER[currentStepIndex + 1];
    if (nextStep) {
      goToStep(nextStep);
    }
  };

  const handleBackStep = () => {
    if (currentStepIndex === 0) {
      return;
    }

    goToStep(STEP_ORDER[currentStepIndex - 1]);
  };

  const handleStepSelect = (stepId: string) => {
    const typedStep = stepId as SetupStepId;
    const targetIndex = getStepIndex(typedStep);

    if (targetIndex <= currentStepIndex || completedSteps.includes(typedStep)) {
      goToStep(typedStep);
      return;
    }

    if (targetIndex === currentStepIndex + 1 && canProceedFromStep(currentStep)) {
      markStepComplete(currentStep);
      goToStep(typedStep);
    }
  };

  const incrementCouncil = () => {
    setDraft((previous) => {
      if (previous.councilSize >= MAX_COUNCIL_SIZE) {
        return previous;
      }

      return {
        ...previous,
        councilSize: previous.councilSize + 1,
        councilSlots: [...previous.councilSlots, null]
      };
    });
  };

  const decrementCouncil = () => {
    setDraft((previous) => {
      if (previous.councilSize <= MIN_COUNCIL_SIZE) {
        return previous;
      }

      const nextSize = previous.councilSize - 1;
      const nextSlots = previous.councilSlots.slice(0, nextSize);
      const nextEfforts = Object.fromEntries(
        Object.entries(previous.councilReasoningEfforts).filter(([key]) => Number(key) < nextSize)
      ) as Record<number, ReasoningEffort>;

      return {
        ...previous,
        councilSize: nextSize,
        councilSlots: nextSlots,
        councilReasoningEfforts: nextEfforts
      };
    });

    setPickerSlotIndex((previous) => {
      if (previous === null) {
        return null;
      }

      return previous >= draft.councilSize - 1 ? null : previous;
    });
  };

  const assignModelToSlot = (index: number, modelId: string) => {
    setDraft((previous) => {
      const nextSlots = [...previous.councilSlots];
      nextSlots[index] = modelId;
      return { ...previous, councilSlots: nextSlots };
    });

    setPickerSlotIndex(null);
  };

  const handleConvene = () => {
    setErrorMessage("");

    if (!isPromptStepValid) {
      goToStep("prompt");
      setErrorMessage(validationMessageForStep("prompt"));
      return;
    }

    if (!isCouncilStepValid) {
      goToStep("council");
      setErrorMessage(validationMessageForStep("council"));
      return;
    }

    const selectedModelIds = draft.councilSlots as string[];
    const councilModels = getModelsByIds(selectedModelIds);
    if (councilModels.length < MIN_COUNCIL_SIZE) {
      goToStep("council");
      setErrorMessage("Some selected models are unavailable.");
      return;
    }

    const judge = getModelById(draft.judgeModelId);
    if (!judge) {
      goToStep("judge");
      setErrorMessage("Judge model is invalid.");
      return;
    }

    if (draft.summaryEnabled && !summaryModel) {
      goToStep("judge");
      setErrorMessage("Summary model is invalid.");
      return;
    }

    const reasoningEffortMap: Record<string, ReasoningEffort> = {};
    for (let index = 0; index < selectedModelIds.length; index += 1) {
      reasoningEffortMap[selectedModelIds[index]] =
        draft.councilReasoningEfforts[index] ?? DEFAULT_REASONING_EFFORT;
    }

    const sessionId = createId();

    addSession({
      id: sessionId,
      question: draft.question.trim(),
      context: draft.context.trim(),
      settings: {
        selectedModelIds,
        judgeModelId: draft.judgeModelId,
        deliberationRounds: draft.deliberationRounds,
        summaryEnabled: draft.summaryEnabled,
        summaryModelId: draft.summaryEnabled ? draft.summaryModelId : undefined,
        reasoningEffortMap,
        judgeReasoningEffort: draft.judgeReasoningEffort,
        summaryReasoningEffort: draft.summaryEnabled ? draft.summaryReasoningEffort : undefined
      },
      status: "running",
      rounds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    router.push(`/session/${sessionId}`);
  };

  return (
    <div className="synapse-root">
      <div className="ambient-orb ambient-orb-violet" aria-hidden />
      <div className="ambient-orb ambient-orb-cyan" aria-hidden />

      <NavPill variant="app" />

      <main className="main-shell">
        <section className={styles.workspaceGrid}>
          <SessionHistoryPanel sessions={sessions} onDeleteSession={removeSession} />

          <div className={styles.setupMain}>
            <header className={styles.setupHeader}>
              <h1 className={styles.setupTitle}>Create Council Session</h1>
              <p className={styles.setupCopy}>
                Configure the prompt, assign specialist models, and tune deliberation depth before
                launch.
              </p>
              <div className={styles.setupMetrics}>
                <span>{draft.councilSize} council members</span>
                <span>{totalRoundsForDraft} total rounds</span>
                <span>~{estimatedModelCalls} model calls</span>
              </div>
            </header>

            <div className={styles.stickyStepHeader}>
              <SetupStepProgress
                steps={SETUP_STEPS}
                currentStepId={currentStep}
                completedStepIds={completedSteps}
                onStepSelect={handleStepSelect}
              />
            </div>

            <section className={styles.stepSurface}>
              {currentStep === "prompt" && (
                <div className={styles.stepContent}>
                  <div className={styles.fieldBlock}>
                    <label className={styles.fieldLabel} htmlFor="question-input">
                      Question
                    </label>
                    <textarea
                      id="question-input"
                      value={draft.question}
                      onChange={(event) =>
                        setDraft((previous) => ({ ...previous, question: event.target.value }))
                      }
                      placeholder="What should the council deliberate on?"
                      rows={5}
                    />
                  </div>

                  <div className={styles.fieldBlock}>
                    <label className={styles.fieldLabel} htmlFor="context-input">
                      Context (Optional)
                    </label>
                    <textarea
                      id="context-input"
                      value={draft.context}
                      onChange={(event) =>
                        setDraft((previous) => ({ ...previous, context: event.target.value }))
                      }
                      placeholder="Constraints, audience, prior decisions, risks, and success criteria"
                      rows={8}
                    />
                  </div>
                </div>
              )}

              {currentStep === "council" && (
                <div className={styles.stepContent}>
                  <div className={styles.inlineHead}>
                    <span className={styles.fieldLabel}>Council Members ({draft.councilSize})</span>
                    <div className={styles.stepperControls}>
                      <button
                        type="button"
                        className={styles.stepperButton}
                        onClick={decrementCouncil}
                        disabled={draft.councilSize <= MIN_COUNCIL_SIZE}
                        aria-label="Remove council member"
                      >
                        −
                      </button>
                      <span className={styles.stepperValue}>{draft.councilSize}</span>
                      <button
                        type="button"
                        className={styles.stepperButton}
                        onClick={incrementCouncil}
                        disabled={draft.councilSize >= MAX_COUNCIL_SIZE}
                        aria-label="Add council member"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className={styles.slotGrid}>
                    {assignedCouncilModels.map(({ index, model, effort }) => (
                      <div
                        key={index}
                        className={`${styles.slotCard} ${
                          model ? styles.slotCardFilled : styles.slotCardEmpty
                        }`}
                      >
                        <button
                          type="button"
                          className={styles.slotSelect}
                          onClick={() => setPickerSlotIndex(index)}
                        >
                          {model ? (
                            <>
                              <span
                                className={styles.slotDot}
                                style={{ backgroundColor: model.color }}
                                aria-hidden
                              />
                              <span className={styles.slotInfo}>
                                <strong>{model.name}</strong>
                                <small>{model.provider}</small>
                              </span>
                            </>
                          ) : (
                            <span className={styles.slotPlaceholder}>+ Select model</span>
                          )}
                        </button>

                        {model && (
                          <select
                            className={styles.effortSelect}
                            value={effort}
                            onChange={(event) => {
                              const value = event.target.value as ReasoningEffort;
                              setDraft((previous) => ({
                                ...previous,
                                councilReasoningEfforts: {
                                  ...previous.councilReasoningEfforts,
                                  [index]: value
                                }
                              }));
                            }}
                            aria-label={`Thinking level for ${model.name}`}
                          >
                            {REASONING_EFFORT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>

                  <p className={styles.stepHint}>
                    Tip: compare diverse models in early slots and keep your strongest synthesizer for
                    judgment.
                  </p>
                </div>
              )}

              {currentStep === "judge" && (
                <div className={styles.stepContent}>
                  <div className={styles.fieldBlock}>
                    <label className={styles.fieldLabel} htmlFor="judge-select">
                      Judge Model
                    </label>
                    <div className={styles.judgeRow}>
                      <select
                        id="judge-select"
                        value={draft.judgeModelId}
                        onChange={(event) =>
                          setDraft((previous) => ({ ...previous, judgeModelId: event.target.value }))
                        }
                      >
                        {MODEL_OPTIONS.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name} ({model.provider})
                          </option>
                        ))}
                      </select>

                      <select
                        className={styles.judgeEffortSelect}
                        value={draft.judgeReasoningEffort}
                        onChange={(event) =>
                          setDraft((previous) => ({
                            ...previous,
                            judgeReasoningEffort: event.target.value as ReasoningEffort
                          }))
                        }
                        aria-label="Judge thinking level"
                      >
                        {REASONING_EFFORT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className={styles.fieldBlock}>
                    <label className={styles.fieldLabel} htmlFor="rounds-range">
                      Deliberation Rounds ({draft.deliberationRounds})
                    </label>
                    <input
                      id="rounds-range"
                      type="range"
                      min={0}
                      max={MAX_DELIBERATION_ROUNDS}
                      step={1}
                      value={draft.deliberationRounds}
                      onChange={(event) =>
                        setDraft((previous) => ({
                          ...previous,
                          deliberationRounds: Number(event.target.value)
                        }))
                      }
                    />
                  </div>

                  <div className={styles.toggleCard}>
                    <div className={styles.toggleCopy}>
                      <p className={styles.toggleTitle}>Inter-round summaries</p>
                      <p className={styles.toggleDescription}>
                        Insert a dedicated summarizer step after each participant round and use that
                        summary as the next stage&apos;s handoff.
                      </p>
                    </div>

                    <label className={styles.toggleControl}>
                      <input
                        type="checkbox"
                        checked={draft.summaryEnabled}
                        onChange={(event) =>
                          setDraft((previous) => ({
                            ...previous,
                            summaryEnabled: event.target.checked
                          }))
                        }
                      />
                      <span>{draft.summaryEnabled ? "On" : "Off"}</span>
                    </label>
                  </div>

                  {draft.summaryEnabled && (
                    <div className={styles.fieldBlock}>
                      <label className={styles.fieldLabel} htmlFor="summary-model-select">
                        Summary Model
                      </label>
                      <div className={styles.judgeRow}>
                        <select
                          id="summary-model-select"
                          value={draft.summaryModelId}
                          onChange={(event) =>
                            setDraft((previous) => ({
                              ...previous,
                              summaryModelId: event.target.value
                            }))
                          }
                        >
                          {MODEL_OPTIONS.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.name} ({model.provider})
                            </option>
                          ))}
                        </select>

                        <select
                          className={styles.judgeEffortSelect}
                          value={draft.summaryReasoningEffort}
                          onChange={(event) =>
                            setDraft((previous) => ({
                              ...previous,
                              summaryReasoningEffort: event.target.value as ReasoningEffort
                            }))
                          }
                          aria-label="Summary thinking level"
                        >
                          {REASONING_EFFORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <div className={styles.judgeSummary}>
                    <p>
                      Judge: <strong>{judgeModel?.name ?? draft.judgeModelId}</strong>
                    </p>
                    <p>
                      Summaries: <strong>{draft.summaryEnabled ? "On" : "Off"}</strong>
                    </p>
                    {draft.summaryEnabled && (
                      <p>
                        Summary model: <strong>{summaryModel?.name ?? draft.summaryModelId}</strong>
                      </p>
                    )}
                    {draft.summaryEnabled && (
                      <p>
                        Summary effort: <strong>{draft.summaryReasoningEffort}</strong>
                      </p>
                    )}
                    <p>
                      Total rounds: <strong>{totalRoundsForDraft}</strong>
                    </p>
                    <p>
                      Estimated requests: <strong>{estimatedModelCalls}</strong>
                    </p>
                  </div>
                </div>
              )}

              {currentStep === "review" && (
                <div className={styles.stepContent}>
                  <div className={styles.reviewGrid}>
                    <article className={styles.reviewCard}>
                      <h3>Prompt</h3>
                      <p>{draft.question.trim() || "No question provided yet."}</p>
                      {draft.context.trim() && (
                        <p className={styles.reviewContext}>{draft.context.trim()}</p>
                      )}
                    </article>

                    <article className={styles.reviewCard}>
                      <h3>Council</h3>
                      <ul>
                        {assignedCouncilModels.map(({ index, model, effort }) => (
                          <li key={index}>
                            <span>
                              Slot {index + 1}: <strong>{model?.name ?? "Unassigned"}</strong>
                            </span>
                            <small>{effort}</small>
                          </li>
                        ))}
                      </ul>
                    </article>

                    <article className={styles.reviewCard}>
                      <h3>Judge & Rounds</h3>
                      <p>
                        Judge: <strong>{judgeModel?.name ?? draft.judgeModelId}</strong>
                      </p>
                      <p>
                        Summaries: <strong>{draft.summaryEnabled ? "On" : "Off"}</strong>
                      </p>
                      {draft.summaryEnabled && (
                        <p>
                          Summary model: <strong>{summaryModel?.name ?? draft.summaryModelId}</strong>
                        </p>
                      )}
                      {draft.summaryEnabled && (
                        <p>
                          Summary effort: <strong>{draft.summaryReasoningEffort}</strong>
                        </p>
                      )}
                      <p>
                        Judge effort: <strong>{draft.judgeReasoningEffort}</strong>
                      </p>
                      <p>
                        Deliberation rounds: <strong>{draft.deliberationRounds}</strong>
                      </p>
                      <p>
                        Total visible rounds: <strong>{totalRoundsForDraft}</strong>
                      </p>
                    </article>
                  </div>
                </div>
              )}
            </section>

            {errorMessage && (
              <p className={styles.errorText} role="status" aria-live="polite">
                {errorMessage}
              </p>
            )}

            <div className={styles.actionBar}>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={handleBackStep}
                disabled={currentStepIndex === 0}
              >
                Back
              </button>

              {currentStep === "review" ? (
                <button
                  type="button"
                  className={styles.primaryAction}
                  onClick={handleConvene}
                  disabled={!canRun}
                >
                  Convene Council
                </button>
              ) : (
                <button type="button" className={styles.primaryAction} onClick={handleNextStep}>
                  Next Step
                </button>
              )}
            </div>
          </div>
        </section>
      </main>

      <ModelPickerModal
        isOpen={pickerSlotIndex !== null}
        selectedModelId={pickerSlotIndex !== null ? draft.councilSlots[pickerSlotIndex] : null}
        onSelect={(modelId) => {
          if (pickerSlotIndex !== null) {
            assignModelToSlot(pickerSlotIndex, modelId);
          }
        }}
        onClose={() => setPickerSlotIndex(null)}
      />

      <Footer />
    </div>
  );
}
