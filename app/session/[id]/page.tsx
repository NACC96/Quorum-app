"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSessionsContext } from "@/lib/sessions-context";
import {
  abortInFlightModelRequest,
  executeCouncilSession,
  retryFailedModelsForRound
} from "@/lib/council-engine";
import {
  formatRoundLabel,
  formatUsd,
  getSessionCostSummary,
  modelShortName,
  msToSeconds
} from "@/lib/format";
import NavPill from "@/app/components/nav-pill";
import Footer from "@/app/components/footer";
import ResponseModal from "@/app/components/response-modal";
import SessionHistoryPanel from "@/app/components/session-history-panel";
import styles from "@/app/session/[id]/session-page.module.css";

export default function SessionPage(): React.JSX.Element {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { sessions, getSession, updateSession, patchSession, removeSession } = useSessionsContext();

  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const [viewingResponseId, setViewingResponseId] = useState<string | null>(null);
  const [retryingRoundId, setRetryingRoundId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const executionStarted = useRef(false);

  const session = getSession(id);

  const costSummary = useMemo(
    () => (session ? getSessionCostSummary(session) : null),
    [session]
  );

  useEffect(() => {
    if (!session) return;
    if (session.status !== "running" || session.rounds.length > 0) return;
    if (executionStarted.current) return;

    executionStarted.current = true;

    executeCouncilSession(
      session,
      (updated) => updateSession(updated),
      (patcher) => patchSession(id, patcher),
      (roundId) => setActiveRoundId(roundId)
    ).catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to execute council session.");
      patchSession(id, (draft) => ({ ...draft, status: "error", updatedAt: new Date().toISOString() }));
    });
  }, [id, patchSession, session, updateSession]);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (!activeRoundId || !session.rounds.some((round) => round.id === activeRoundId)) {
      const lastRound = session.rounds[session.rounds.length - 1];
      setActiveRoundId(lastRound?.id ?? null);
    }
  }, [activeRoundId, session]);

  const activeRound = useMemo(() => {
    if (!session || !activeRoundId) {
      return null;
    }

    return session.rounds.find((round) => round.id === activeRoundId) ?? null;
  }, [activeRoundId, session]);

  const viewingResponseData = useMemo(() => {
    if (!session || !viewingResponseId) {
      return null;
    }

    for (const round of session.rounds) {
      const found = round.responses.find((response) => response.id === viewingResponseId);
      if (found) {
        return {
          response: found,
          roundType: round.type
        };
      }
    }

    return null;
  }, [session, viewingResponseId]);

  const activeRoundFailedCount = useMemo(
    () => activeRound?.responses.filter((response) => response.status === "error").length ?? 0,
    [activeRound]
  );

  const canRetryFailedModels =
    Boolean(activeRound) &&
    activeRound?.status === "complete" &&
    session?.status !== "running" &&
    activeRoundFailedCount > 0 &&
    retryingRoundId === null;

  const handleRetryFailedModels = async () => {
    if (!session || !activeRound || !canRetryFailedModels) {
      return;
    }

    setErrorMessage("");
    setRetryingRoundId(activeRound.id);

    try {
      await retryFailedModelsForRound(
        session,
        activeRound.id,
        (updated) => updateSession(updated),
        (patcher) => patchSession(id, patcher)
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to retry failed models for this round."
      );
    } finally {
      setRetryingRoundId(null);
    }
  };

  const handleAbortPendingModel = (modelId: string) => {
    if (!session || !activeRound) {
      return;
    }

    const didAbort = abortInFlightModelRequest(session.id, activeRound.id, modelId);
    if (!didAbort) {
      setErrorMessage("This model request is no longer active.");
    }
  };

  const handleDeleteSession = (sessionId: string) => {
    removeSession(sessionId);

    if (sessionId === id) {
      router.push("/council");
    }
  };

  const renderResponseError = (
    response: {
      error?: string;
      errorReason?: string;
      errorRequestId?: string;
    },
    fallbackMessage: string
  ) => (
    <div className={styles.responseErrorStack}>
      <p className={styles.responseError}>{response.error ?? fallbackMessage}</p>
      {response.errorReason && <p className={styles.responseErrorMeta}>Reason: {response.errorReason}</p>}
      {response.errorRequestId && (
        <p className={styles.responseErrorMeta}>
          Request ID: <code>{response.errorRequestId}</code>
        </p>
      )}
    </div>
  );

  if (!session) {
    return (
      <div className="synapse-root">
        <div className="ambient-orb ambient-orb-violet" aria-hidden />
        <div className="ambient-orb ambient-orb-cyan" aria-hidden />

        <NavPill variant="app" />

        <main className="main-shell">
          <section className={styles.notFoundCard}>
            <h2>Session Not Found</h2>
            <p>This session doesn&apos;t exist or has been deleted.</p>
            <Link href="/council" className={styles.launchLink}>
              New Council Session
            </Link>
          </section>
        </main>

        <Footer />
      </div>
    );
  }

  return (
    <div className="synapse-root">
      <div className="ambient-orb ambient-orb-violet" aria-hidden />
      <div className="ambient-orb ambient-orb-cyan" aria-hidden />

      <NavPill variant="app" />

      <main className="main-shell">
        <section className={styles.workspaceGrid}>
          <SessionHistoryPanel
            sessions={sessions}
            activeSessionId={id}
            onDeleteSession={handleDeleteSession}
          />

          <div className={styles.mainColumn}>
            <section className={styles.summaryCard}>
              <div className={styles.summaryHead}>
                <h2 title={session.question}>{session.question}</h2>
                {session.status === "complete" && (
                  <Link href={`/council?from=${session.id}`} className={styles.rerunButton}>
                    Re-run Council
                  </Link>
                )}
              </div>

              <div className={styles.summaryMeta}>
                <span>
                  <small>Status</small>
                  <strong>{session.status}</strong>
                </span>
                <span>
                  <small>Members</small>
                  <strong>{session.settings.selectedModelIds.length}</strong>
                </span>
                <span>
                  <small>Judge</small>
                  <strong>{modelShortName(session.settings.judgeModelId)}</strong>
                </span>
                <span>
                  <small>Rounds</small>
                  <strong>{session.settings.deliberationRounds}</strong>
                </span>
                {costSummary && (
                  <span>
                    <small>{session.status === "running" ? "Cost so far" : "Total cost"}</small>
                    <strong>
                      {formatUsd(costSummary.totalCostUsd)}
                      {costSummary.isPartial ? " (partial)" : ""}
                    </strong>
                  </span>
                )}
              </div>
            </section>

            <section className={styles.roundPanel}>
              <div className={styles.panelHead}>
                <h3>Deliberation Timeline</h3>
                {activeRound && (
                  <p>
                    Active: <strong>{formatRoundLabel(activeRound)}</strong>
                  </p>
                )}
              </div>

              {session.rounds.length === 0 && (
                <div className={styles.emptyRoundState} role="status" aria-live="polite">
                  <div className={styles.spinner} aria-hidden />
                  <p>Starting council session and requesting first responses...</p>
                </div>
              )}

              {session.rounds.length > 0 && (
                <>
                  <div className={styles.roundTabs}>
                    {session.rounds.map((round) => (
                      <button
                        key={round.id}
                        type="button"
                        className={`${styles.roundTab} ${round.id === activeRoundId ? styles.roundTabActive : ""}`}
                        onClick={() => setActiveRoundId(round.id)}
                      >
                        <span>{formatRoundLabel(round)}</span>
                        <small>{round.status}</small>
                      </button>
                    ))}
                  </div>

                  {activeRound && activeRoundFailedCount > 0 && (
                    <div className={styles.roundActions}>
                      <button
                        type="button"
                        className={styles.retryButton}
                        onClick={handleRetryFailedModels}
                        disabled={!canRetryFailedModels}
                      >
                        {retryingRoundId === activeRound.id
                          ? "Retrying failed models..."
                          : `Retry failed models only (${activeRoundFailedCount})`}
                      </button>
                    </div>
                  )}

                  {activeRound && (
                    <div
                      className={`${styles.responseGrid} ${
                        activeRound.type === "judgment" ? styles.responseGridJudgment : ""
                      }`}
                    >
                      {activeRound.responses.map((response) => {
                        const isJudgment = activeRound.type === "judgment";
                        const preview =
                          response.content && response.content.length > 220
                            ? `${response.content.slice(0, 220)}...`
                            : response.content;

                        return (
                          <article
                            key={response.id}
                            className={`${styles.responseCard} ${
                              response.status !== "pending" ? styles.responseCardCompact : ""
                            } ${response.status === "complete" ? styles.responseCardClickable : ""}`}
                            onClick={() =>
                              response.status === "complete"
                                ? setViewingResponseId(response.id)
                                : undefined
                            }
                            role={response.status === "complete" ? "button" : undefined}
                            tabIndex={response.status === "complete" ? 0 : undefined}
                            onKeyDown={
                              response.status === "complete"
                                ? (event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      setViewingResponseId(response.id);
                                    }
                                  }
                                : undefined
                            }
                          >
                            <header className={styles.responseHead}>
                              <span className={styles.responseModel}>
                                <span
                                  className={styles.responseDot}
                                  style={{ backgroundColor: response.color }}
                                  aria-hidden
                                />
                                {response.modelName}
                              </span>

                              <span className={styles.responseMetaRow}>
                                {response.status === "pending" && (
                                  <span className={`${styles.responseBadge} ${styles.responseBadgePending}`}>
                                    Processing
                                  </span>
                                )}
                                {response.status === "error" && (
                                  <span className={`${styles.responseBadge} ${styles.responseBadgeError}`}>
                                    Error
                                  </span>
                                )}
                                {response.status === "complete" && (
                                  <span className={`${styles.responseBadge} ${styles.responseBadgeComplete}`}>
                                    Complete
                                  </span>
                                )}
                                <span className={styles.responseMetrics}>
                                  {response.tokenCount > 0 && <span>{response.tokenCount} tok</span>}
                                  {response.latencyMs > 0 && <span>{msToSeconds(response.latencyMs)}</span>}
                                  {response.status === "complete" &&
                                    (typeof response.costUsd === "number" ? (
                                      <span>{formatUsd(response.costUsd)}</span>
                                    ) : (
                                      <span>cost n/a</span>
                                    ))}
                                </span>
                              </span>
                            </header>

                            {response.status === "pending" && (
                              <>
                                <div className={styles.responseLoading}>
                                  <div className={styles.skeletonLine} />
                                  <div className={`${styles.skeletonLine} ${styles.skeletonLine90}`} />
                                  <div className={`${styles.skeletonLine} ${styles.skeletonLine70}`} />
                                </div>

                                <button
                                  type="button"
                                  className={styles.abortButton}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleAbortPendingModel(response.modelId);
                                  }}
                                >
                                  Abort Request
                                </button>
                              </>
                            )}

                            {response.status === "error" &&
                              renderResponseError(response, "Model execution failed.")}

                            {response.status === "complete" && (
                              <div className={styles.responseBody}>
                                {isJudgment ? (
                                  <p className={styles.verdictPreview}>{preview}</p>
                                ) : (
                                  <p className={styles.standardPreview}>
                                    Open full response to inspect details.
                                  </p>
                                )}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </section>

            {errorMessage && (
              <p className={styles.errorText} role="status" aria-live="polite">
                {errorMessage}
              </p>
            )}
          </div>
        </section>
      </main>

      <ResponseModal
        response={viewingResponseData?.response ?? null}
        roundType={viewingResponseData?.roundType ?? null}
        onClose={() => setViewingResponseId(null)}
      />

      <Footer />
    </div>
  );
}
