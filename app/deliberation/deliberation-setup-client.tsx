"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_COUNCIL,
  DEFAULT_JUDGE,
  DEFAULT_REASONING_EFFORT,
  MAX_COUNCIL_SIZE,
  MIN_COUNCIL_SIZE,
  MODEL_OPTIONS,
  REASONING_EFFORT_OPTIONS,
  getModelById,
  getModelsByIds
} from "@/lib/models";
import { DeliberationSettings, ReasoningEffort } from "@/lib/types";
import { getAllArchetypes } from "@/lib/archetypes";
import { useDeliberationContext } from "@/lib/deliberation-context";
import { createDeliberationSession } from "@/lib/deliberation-engine";
import NavPill from "@/app/components/nav-pill";
import Footer from "@/app/components/footer";
import ModelPickerModal from "@/app/components/model-picker-modal";
import SetupStepProgress, { SetupStepProgressItem } from "@/app/components/setup-step-progress";
import DeliberationHistoryPanel from "@/app/components/deliberation-history-panel";
import styles from "@/app/deliberation/deliberation-setup.module.css";

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
    label: "Judge & Turns",
    description: "Judge model and batch size"
  },
  {
    id: "review",
    label: "Review",
    description: "Validate and start"
  }
];

const STEP_ORDER: SetupStepId[] = ["prompt", "council", "judge", "review"];

interface DeliberationDraft {
  question: string;
  context: string;
  councilSize: number;
  councilSlots: (string | null)[];
  councilReasoningEfforts: Record<number, ReasoningEffort>;
  councilArchetypeMap: Record<number, string | null>;
  judgeModelId: string;
  judgeReasoningEffort: ReasoningEffort;
  judgeArchetypeId: string | null;
  turnsPerBatch: number;
}

const INITIAL_DRAFT: DeliberationDraft = {
  question: "",
  context: "",
  councilSize: DEFAULT_COUNCIL.length,
  councilSlots: DEFAULT_COUNCIL.map((id) => id),
  councilReasoningEfforts: {},
  councilArchetypeMap: {},
  judgeModelId: DEFAULT_JUDGE,
  judgeReasoningEffort: DEFAULT_REASONING_EFFORT,
  judgeArchetypeId: null,
  turnsPerBatch: DEFAULT_COUNCIL.length
};

function getStepIndex(step: SetupStepId): number {
  return STEP_ORDER.indexOf(step);
}

export default function DeliberationSetupClient(): React.JSX.Element {
  const router = useRouter();
  const { deliberations, addDeliberation, removeDeliberation, getDeliberation } = useDeliberationContext();
  const searchParams = useSearchParams();
  const fromSessionId = searchParams.get("from");

  const initialDraft = useMemo<DeliberationDraft>(() => {
    if (!fromSessionId) {
      return INITIAL_DRAFT;
    }

    const source = getDeliberation(fromSessionId);
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

    const archetypeMap: Record<number, string | null> = {};
    if (source.settings.archetypeMap) {
      for (const [key, value] of Object.entries(source.settings.archetypeMap)) {
        archetypeMap[Number(key)] = value;
      }
    }

    return {
      question: source.question,
      context: source.context,
      councilSize: modelIds.length,
      councilSlots: [...modelIds],
      councilReasoningEfforts: effortMap,
      councilArchetypeMap: archetypeMap,
      judgeModelId: source.settings.judgeModelId,
      judgeReasoningEffort: source.settings.judgeReasoningEffort ?? DEFAULT_REASONING_EFFORT,
      judgeArchetypeId: source.settings.judgeArchetypeId ?? null,
      turnsPerBatch: source.settings.turnsPerBatch,
    };
  }, [fromSessionId, getDeliberation]);

  const [draft, setDraft] = useState<DeliberationDraft>(initialDraft);
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

  const filledSlotCount = draft.councilSlots.filter((s) => s !== null).length;

  const isPromptStepValid = draft.question.trim().length > 0;
  const isCouncilStepValid =
    draft.councilSlots.length >= MIN_COUNCIL_SIZE &&
    draft.councilSlots.every((slot) => slot !== null);
  const isJudgeStepValid = Boolean(getModelById(draft.judgeModelId));
  const canRun = isPromptStepValid && isCouncilStepValid && isJudgeStepValid;

  const assignedCouncilModels = draft.councilSlots.map((modelId, index) => ({
    index,
    model: modelId ? getModelById(modelId) : null,
    effort: draft.councilReasoningEfforts[index] ?? DEFAULT_REASONING_EFFORT
  }));

  const judgeModel = getModelById(draft.judgeModelId);

  const councilArchetypes = useMemo(() => getAllArchetypes("council"), []);
  const judgeArchetypes = useMemo(() => getAllArchetypes("judge"), []);

  const canProceedFromStep = (step: SetupStepId): boolean => {
    if (step === "prompt") return isPromptStepValid;
    if (step === "council") return isCouncilStepValid;
    if (step === "judge") return isJudgeStepValid;
    return canRun;
  };

  const validationMessageForStep = (step: SetupStepId): string => {
    if (step === "prompt") return "Add a question before moving to council configuration.";
    if (step === "council") return "Assign a model to each council slot before continuing.";
    if (step === "judge") return "Select a valid judge model to continue.";
    return "Resolve setup issues before starting deliberation.";
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
    if (currentStepIndex === 0) return;
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
      if (previous.councilSize >= MAX_COUNCIL_SIZE) return previous;
      return {
        ...previous,
        councilSize: previous.councilSize + 1,
        councilSlots: [...previous.councilSlots, null]
      };
    });
  };

  const decrementCouncil = () => {
    setDraft((previous) => {
      if (previous.councilSize <= MIN_COUNCIL_SIZE) return previous;

      const nextSize = previous.councilSize - 1;
      const nextSlots = previous.councilSlots.slice(0, nextSize);
      const nextEfforts = Object.fromEntries(
        Object.entries(previous.councilReasoningEfforts).filter(([key]) => Number(key) < nextSize)
      ) as Record<number, ReasoningEffort>;

      const nextArchetypes = Object.fromEntries(
        Object.entries(previous.councilArchetypeMap).filter(([key]) => Number(key) < nextSize)
      ) as Record<number, string | null>;

      return {
        ...previous,
        councilSize: nextSize,
        councilSlots: nextSlots,
        councilReasoningEfforts: nextEfforts,
        councilArchetypeMap: nextArchetypes
      };
    });

    setPickerSlotIndex((previous) => {
      if (previous === null) return null;
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

  const handleStartDeliberation = () => {
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

    const reasoningEffortMap: Record<string, ReasoningEffort> = {};
    for (let index = 0; index < selectedModelIds.length; index += 1) {
      reasoningEffortMap[selectedModelIds[index]] =
        draft.councilReasoningEfforts[index] ?? DEFAULT_REASONING_EFFORT;
    }

    const archetypeMap: Record<number, string> = {};
    for (let index = 0; index < selectedModelIds.length; index += 1) {
      const archetypeId = draft.councilArchetypeMap[index];
      if (archetypeId) {
        archetypeMap[index] = archetypeId;
      }
    }

    const settings: DeliberationSettings = {
      selectedModelIds,
      judgeModelId: draft.judgeModelId,
      turnsPerBatch: draft.turnsPerBatch,
      archetypeMap: Object.keys(archetypeMap).length > 0 ? archetypeMap : undefined,
      judgeArchetypeId: draft.judgeArchetypeId ?? undefined,
      reasoningEffortMap,
      judgeReasoningEffort: draft.judgeReasoningEffort
    };

    const session = createDeliberationSession(
      draft.question.trim(),
      draft.context.trim(),
      settings
    );

    addDeliberation(session);
    router.push(`/deliberation/${session.id}`);
  };

  return (
    <div className="synapse-root">
      <div className="ambient-orb ambient-orb-violet" aria-hidden />
      <div className="ambient-orb ambient-orb-cyan" aria-hidden />

      <NavPill variant="app" />

      <main className="main-shell">
        <div className={styles.pageGrid}>
          <DeliberationHistoryPanel
            sessions={deliberations}
            onDeleteSession={removeDeliberation}
          />

          <div className={styles.setupContainer}>
          <header className={styles.setupHeader}>
            <h1 className={styles.setupTitle}>Start Deliberation</h1>
            <p className={styles.setupCopy}>
              Configure the prompt, assign models, and set batch size before launching a
              multi-turn deliberation.
            </p>
            <div className={styles.setupMetrics}>
              <span>{filledSlotCount} council members</span>
              <span>{draft.turnsPerBatch} turns per batch</span>
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
                        <div className={styles.slotControls}>
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

                          <select
                            className={styles.archetypeSelect}
                            value={draft.councilArchetypeMap[index] ?? ""}
                            onChange={(event) => {
                              const value = event.target.value || null;
                              setDraft((previous) => ({
                                ...previous,
                                councilArchetypeMap: {
                                  ...previous.councilArchetypeMap,
                                  [index]: value
                                }
                              }));
                            }}
                            aria-label={`Archetype for ${model.name}`}
                          >
                            <option value="">No archetype</option>
                            {councilArchetypes.map((archetype) => (
                              <option key={archetype.id} value={archetype.id}>
                                {archetype.icon} {archetype.name}
                              </option>
                            ))}
                          </select>
                        </div>
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
                  <label className={styles.fieldLabel} htmlFor="judge-archetype-select">
                    Judge Archetype
                  </label>
                  <select
                    id="judge-archetype-select"
                    value={draft.judgeArchetypeId ?? ""}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        judgeArchetypeId: event.target.value || null
                      }))
                    }
                  >
                    <option value="">No archetype</option>
                    {judgeArchetypes.map((archetype) => (
                      <option key={archetype.id} value={archetype.id}>
                        {archetype.icon} {archetype.name} — {archetype.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.fieldBlock}>
                  <label className={styles.fieldLabel} htmlFor="turns-per-batch">
                    Turns per Batch ({draft.turnsPerBatch})
                  </label>
                  <input
                    id="turns-per-batch"
                    type="number"
                    min={1}
                    max={20}
                    value={draft.turnsPerBatch}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        turnsPerBatch: Math.max(1, Math.min(20, Number(event.target.value) || 1))
                      }))
                    }
                  />
                  <p className={styles.turnsHint}>
                    Number of model messages per batch. Set to the number of models (
                    {filledSlotCount}) for each to speak once.
                  </p>
                </div>

                <div className={styles.judgeSummary}>
                  <p>
                    Judge: <strong>{judgeModel?.name ?? draft.judgeModelId}</strong>
                  </p>
                  <p>
                    Judge effort: <strong>{draft.judgeReasoningEffort}</strong>
                  </p>
                  <p>
                    Turns per batch: <strong>{draft.turnsPerBatch}</strong>
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
                      {assignedCouncilModels.map(({ index, model, effort }) => {
                        const slotArchetype = councilArchetypes.find(
                          (a) => a.id === draft.councilArchetypeMap[index]
                        );
                        return (
                          <li key={index}>
                            <span>
                              Slot {index + 1}: <strong>{model?.name ?? "Unassigned"}</strong>
                              {slotArchetype && (
                                <> — {slotArchetype.icon} {slotArchetype.name}</>
                              )}
                            </span>
                            <small>{effort}</small>
                          </li>
                        );
                      })}
                    </ul>
                  </article>

                  <article className={styles.reviewCard}>
                    <h3>Judge & Turns</h3>
                    <p>
                      Judge: <strong>{judgeModel?.name ?? draft.judgeModelId}</strong>
                    </p>
                    {draft.judgeArchetypeId && (() => {
                      const ja = judgeArchetypes.find((a) => a.id === draft.judgeArchetypeId);
                      return ja ? (
                        <p>
                          Judge archetype: <strong>{ja.icon} {ja.name}</strong>
                        </p>
                      ) : null;
                    })()}
                    <p>
                      Judge effort: <strong>{draft.judgeReasoningEffort}</strong>
                    </p>
                    <p>
                      Turns per batch: <strong>{draft.turnsPerBatch}</strong>
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
                onClick={handleStartDeliberation}
                disabled={!canRun}
              >
                Start Deliberation
              </button>
            ) : (
              <button type="button" className={styles.primaryAction} onClick={handleNextStep}>
                Next Step
              </button>
            )}
          </div>
        </div>
        </div>
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
