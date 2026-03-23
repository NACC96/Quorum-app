"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useDeliberationContext } from "@/lib/deliberation-context";
import {
  executeDeliberationBatch,
  executeJudgePhase,
  executeVoting,
  addUserMessage,
  type BatchCallbacks,
} from "@/lib/deliberation-engine";
import { formatUsd, msToSeconds } from "@/lib/format";
import { DeliberationMessage, DeliberationSession, JudgeSolution, ModelVote } from "@/lib/types";
import { getModelById } from "@/lib/models";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import NavPill from "@/app/components/nav-pill";
import Footer from "@/app/components/footer";
import DeliberationHistoryPanel from "@/app/components/deliberation-history-panel";
import SolutionModal from "@/app/components/solution-modal";
import styles from "@/app/deliberation/[id]/deliberation-chat.module.css";

export default function DeliberationChatPage(): React.JSX.Element {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { deliberations, getDeliberation, updateDeliberation, removeDeliberation } =
    useDeliberationContext();

  // Local copy of session for fast UI updates during streaming
  const [session, setSession] = useState<DeliberationSession | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [userMessage, setUserMessage] = useState("");
  const [nextBatchSize, setNextBatchSize] = useState<number | null>(null);
  const [selectedSolutionId, setSelectedSolutionId] = useState<string | null>(null);

  const messageEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoStarted = useRef(false);
  const sessionWasPresent = useRef(false);

  const contextSession = getDeliberation(id);

  useEffect(() => {
    if (contextSession) {
      sessionWasPresent.current = true;
    }
  }, [contextSession]);

  useEffect(() => {
    if (!contextSession && sessionWasPresent.current) {
      router.push("/deliberation");
    }
  }, [contextSession, router]);

  // Load session from context
  useEffect(() => {
    const loaded = getDeliberation(id);
    if (loaded) {
      setSession(loaded);
      if (nextBatchSize === null) {
        setNextBatchSize(loaded.settings.turnsPerBatch);
      }
    }
  }, [id, getDeliberation, nextBatchSize]);

  // Persist session changes to context
  const persistSession = useCallback(
    (updated: DeliberationSession) => {
      setSession(updated);
      updateDeliberation(updated);
    },
    [updateDeliberation]
  );

  // ---- Auto-start first batch on mount ----
  useEffect(() => {
    if (!session) return;
    if (autoStarted.current) return;
    if (session.phase !== "deliberating" || session.messages.length > 0) return;

    autoStarted.current = true;
    runBatch(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // ---- Engine operations ----

  const runBatch = async (currentSession: DeliberationSession) => {
    if (isRunning) return;
    setIsRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let working = {
      ...currentSession,
      totalTurnsInBatch: nextBatchSize ?? currentSession.settings.turnsPerBatch,
      batchStartTurn: currentSession.currentTurn,
      phase: "deliberating" as const,
    };
    setSession(working);

    const callbacks: BatchCallbacks = {
      onTurnStart: (_modelId, turnNumber, pendingMessage) => {
        setSession((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            currentTurn: turnNumber,
            messages: [...prev.messages, pendingMessage],
          };
        });
      },
      onChunk: (chunk) => {
        setSession((prev) => {
          if (!prev) return prev;
          const msgs = [...prev.messages];
          const last = msgs[msgs.length - 1];
          if (last && last.status === "streaming") {
            msgs[msgs.length - 1] = { ...last, content: last.content + chunk };
          }
          return { ...prev, messages: msgs };
        });
      },
      onTurnComplete: (message) => {
        setSession((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) => (m.id === message.id ? message : m)),
          };
        });
      },
      onBatchComplete: (completed) => {
        persistSession(completed);
      },
    };

    try {
      const result = await executeDeliberationBatch(working, callbacks, controller.signal);
      if (controller.signal.aborted) {
        const cleaned = {
          ...result,
          messages: result.messages.filter(
            (m) => m.status !== "error" || !m.error?.toLowerCase().includes("abort")
          ),
        };
        setSession(cleaned);
        persistSession(cleaned);
      } else {
        persistSession(result);
      }
    } catch {
      // aborted or errored — keep current state
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const runJudge = async (currentSession: DeliberationSession) => {
    if (isRunning) return;
    setIsRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let working = { ...currentSession, phase: "judging" as const };
    setSession(working);

    try {
      const result = await executeJudgePhase(
        working,
        {
          onStart: (pendingMessage) => {
            setSession((prev) => {
              if (!prev) return prev;
              return { ...prev, messages: [...prev.messages, pendingMessage] };
            });
          },
          onChunk: (chunk) => {
            setSession((prev) => {
              if (!prev) return prev;
              const msgs = [...prev.messages];
              const last = msgs[msgs.length - 1];
              if (last && last.status === "streaming") {
                msgs[msgs.length - 1] = { ...last, content: last.content + chunk };
              }
              return { ...prev, messages: msgs };
            });
          },
          onComplete: (_solutions) => {
            // handled after return
          },
        },
        controller.signal
      );
      persistSession(result);
    } catch {
      // aborted or errored
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const runVoting = async (currentSession: DeliberationSession) => {
    if (isRunning) return;
    setIsRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let working = { ...currentSession, phase: "voting" as const };
    setSession(working);

    try {
      const result = await executeVoting(
        working,
        {
          onVoteComplete: (vote) => {
            setSession((prev) => {
              if (!prev) return prev;
              const existing = prev.votes ?? [];
              return { ...prev, votes: [...existing, vote] };
            });
          },
        },
        controller.signal
      );
      persistSession(result);
    } catch {
      // aborted or errored
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  // ---- User actions ----

  const handleInterrupt = () => {
    abortRef.current?.abort();
  };

  const handleSendAndContinue = () => {
    if (!session) return;
    let updated = session;
    if (userMessage.trim()) {
      updated = addUserMessage(updated, userMessage.trim());
      persistSession(updated);
      setUserMessage("");
    }
    runBatch(updated);
  };

  const handleSendToJudge = () => {
    if (!session) return;
    let updated = session;
    if (userMessage.trim()) {
      updated = addUserMessage(updated, userMessage.trim());
      persistSession(updated);
      setUserMessage("");
    }
    runJudge(updated);
  };

  const handleSkipAndContinue = () => {
    if (!session) return;
    runBatch(session);
  };

  const handleSkipToJudge = () => {
    if (!session) return;
    runJudge(session);
  };

  const handleStartVoting = () => {
    if (!session) return;
    runVoting(session);
  };

  // ---- Computed values ----

  const winningSolutionId = (() => {
    if (!session?.votes || !session.judgeSolutions) return null;
    const tally: Record<string, number> = {};
    for (const vote of session.votes) {
      tally[vote.chosenSolutionId] = (tally[vote.chosenSolutionId] ?? 0) + 1;
    }
    let maxCount = 0;
    let winnerId = "";
    for (const [solutionId, count] of Object.entries(tally)) {
      if (count > maxCount) {
        maxCount = count;
        winnerId = solutionId;
      }
    }
    return winnerId || null;
  })();

  const voteTally = (() => {
    if (!session?.votes || !session.judgeSolutions) return [];
    const tally: Record<string, number> = {};
    for (const vote of session.votes) {
      tally[vote.chosenSolutionId] = (tally[vote.chosenSolutionId] ?? 0) + 1;
    }
    return session.judgeSolutions.map((s) => ({
      solution: s,
      count: tally[s.id] ?? 0,
    }));
  })();

  // ---- Not found ----

  if (!session) {
    return (
      <div className="synapse-root">
        <div className="ambient-orb ambient-orb-violet" aria-hidden />
        <div className="ambient-orb ambient-orb-cyan" aria-hidden />
        <NavPill variant="app" />
        <main className="main-shell">
          <section className={styles.notFoundCard}>
            <h2>Session Not Found</h2>
            <p>This deliberation doesn&apos;t exist or has been deleted.</p>
            <Link href="/deliberation" className={styles.launchLink}>
              New Deliberation
            </Link>
          </section>
        </main>
        <Footer />
      </div>
    );
  }

  // ---- Render helpers ----

  const getRealModelName = (modelId: string | undefined): string | undefined => {
    if (!modelId || !session.aliasMap?.[modelId]) return undefined;
    return getModelById(modelId)?.name;
  };

  const renderMessage = (msg: DeliberationMessage) => {
    if (msg.role === "user") {
      return (
        <div key={msg.id} className={`${styles.message} ${styles.messageUser}`}>
          <div className={styles.messageHeader}>
            <span className={styles.messageName}>You</span>
          </div>
          <div className={styles.messageContent}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const inline = !match && !String(children).includes("\n");
                  return inline ? (
                    <code className={styles.inlineCode} {...props}>{children}</code>
                  ) : (
                    <SyntaxHighlighter
                      style={oneDark}
                      language={match?.[1] || "text"}
                      PreTag="div"
                      customStyle={{
                        borderRadius: "10px",
                        fontSize: "0.85rem",
                        margin: "0.75rem 0",
                        padding: "0.85rem",
                      }}
                    >
                      {String(children).replace(/\n$/, "")}
                    </SyntaxHighlighter>
                  );
                },
              }}
            >
              {msg.content || ""}
            </ReactMarkdown>
          </div>
        </div>
      );
    }

    if (msg.role === "judge") {
      return (
        <div key={msg.id} className={`${styles.message} ${styles.messageJudge}`}>
          <div className={styles.messageHeader}>
            <span
              className={styles.messageDot}
              style={{ backgroundColor: msg.color ?? "#fbbf24" }}
              aria-hidden
            />
            <span className={styles.messageName} title={getRealModelName(msg.modelId)}>Judge: {msg.modelName}</span>
          </div>
          <div className={styles.messageContent}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const inline = !match && !String(children).includes("\n");
                  return inline ? (
                    <code className={styles.inlineCode} {...props}>{children}</code>
                  ) : (
                    <SyntaxHighlighter
                      style={oneDark}
                      language={match?.[1] || "text"}
                      PreTag="div"
                      customStyle={{
                        borderRadius: "10px",
                        fontSize: "0.85rem",
                        margin: "0.75rem 0",
                        padding: "0.85rem",
                      }}
                    >
                      {String(children).replace(/\n$/, "")}
                    </SyntaxHighlighter>
                  );
                },
              }}
            >
              {msg.content || ""}
            </ReactMarkdown>
            {msg.status === "streaming" && <span className={styles.streamingCursor} />}
          </div>
          {msg.status === "error" && (
            <p className={styles.messageErrorText}>{msg.error ?? "Judge execution failed."}</p>
          )}
          {msg.status === "complete" && (
            <div className={styles.messageMetrics}>
              {msg.tokenCount != null && msg.tokenCount > 0 && <span>{msg.tokenCount} tok</span>}
              {msg.latencyMs != null && msg.latencyMs > 0 && <span>{msToSeconds(msg.latencyMs)}</span>}
              {msg.costUsd != null && <span>{formatUsd(msg.costUsd)}</span>}
            </div>
          )}
        </div>
      );
    }

    if (msg.status === "error") {
      return (
        <div key={msg.id} className={`${styles.message} ${styles.messageError}`}>
          <div className={styles.messageHeader}>
            <span
              className={styles.messageDot}
              style={{ backgroundColor: msg.color ?? "#f87171" }}
              aria-hidden
            />
            <span className={styles.messageName} title={getRealModelName(msg.modelId)}>{msg.modelName ?? "Model"}</span>
          </div>
          <p className={styles.messageErrorText}>{msg.error ?? "Model execution failed."}</p>
        </div>
      );
    }

    // Model message
    return (
      <div
        key={msg.id}
        className={`${styles.message} ${styles.messageModel}`}
        style={{ "--msg-color": msg.color ?? "rgba(139, 92, 246, 0.7)" } as React.CSSProperties}
      >
        <div className={styles.messageHeader}>
          <span
            className={styles.messageDot}
            style={{ backgroundColor: msg.color ?? "#8b5cf6" }}
            aria-hidden
          />
          <span className={styles.messageName} title={getRealModelName(msg.modelId)}>{msg.modelName ?? "Model"}</span>
          {getRealModelName(msg.modelId) && (
            <small className={styles.messageModelId}>{getRealModelName(msg.modelId)}</small>
          )}
        </div>
        <div className={styles.messageContent}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                const inline = !match && !String(children).includes("\n");
                return inline ? (
                  <code className={styles.inlineCode} {...props}>{children}</code>
                ) : (
                  <SyntaxHighlighter
                    style={oneDark}
                    language={match?.[1] || "text"}
                    PreTag="div"
                    customStyle={{
                      borderRadius: "10px",
                      fontSize: "0.85rem",
                      margin: "0.75rem 0",
                      padding: "0.85rem",
                    }}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                );
              },
            }}
          >
            {msg.content || ""}
          </ReactMarkdown>
          {msg.status === "streaming" && <span className={styles.streamingCursor} />}
        </div>
        {msg.status === "complete" && (
          <div className={styles.messageMetrics}>
            {msg.tokenCount != null && msg.tokenCount > 0 && <span>{msg.tokenCount} tok</span>}
            {msg.latencyMs != null && msg.latencyMs > 0 && <span>{msToSeconds(msg.latencyMs)}</span>}
            {msg.costUsd != null && <span>{formatUsd(msg.costUsd)}</span>}
          </div>
        )}
      </div>
    );
  };

  const renderControls = () => {
    const phase = session.phase;

    if (phase === "deliberating" && isRunning) {
      const activeModel = session.messages.findLast((m) => m.role === "model");
      return (
        <div className={styles.controlBar}>
          <div className={styles.phaseIndicator}>
            <div className={styles.phaseSpinner} aria-hidden />
            <span>
              Turn {session.currentTurn - (session.batchStartTurn ?? 0) + 1} of {session.totalTurnsInBatch}
              {session.batchStartTurn ? ` (${session.currentTurn + 1} total)` : ""}
              {activeModel?.modelName ? ` — ${activeModel.modelName} is thinking...` : " — Processing..."}
            </span>
            <button type="button" className={styles.btnInterrupt} onClick={handleInterrupt}>
              Interrupt
            </button>
          </div>
        </div>
      );
    }

    if (phase === "user-turn" && !isRunning) {
      return (
        <div className={styles.controlBar}>
          <div className={styles.inputArea}>
            <div className={styles.inputRow}>
              <textarea
                className={styles.chatTextarea}
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                placeholder="Add your thoughts (optional)..."
                rows={2}
              />
              <div>
                <input
                  type="number"
                  className={styles.batchSizeInput}
                  value={nextBatchSize ?? session.settings.turnsPerBatch}
                  min={1}
                  max={20}
                  onChange={(e) =>
                    setNextBatchSize(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
                  }
                  aria-label="Turns for next batch"
                />
                <div className={styles.batchLabel}>More turns</div>
              </div>
            </div>

            <div className={styles.actionButtons}>
              <button type="button" className={styles.btnPrimary} onClick={handleSendAndContinue}>
                {userMessage.trim() ? "Send & Continue" : "Continue"}
              </button>
              <button type="button" className={styles.btnJudge} onClick={handleSendToJudge}>
                {userMessage.trim() ? "Send to Judge" : "Skip to Judge"}
              </button>
              {userMessage.trim() && (
                <>
                  <button type="button" className={styles.btnSecondary} onClick={handleSkipAndContinue}>
                    Skip & Continue
                  </button>
                  <button type="button" className={styles.btnSecondary} onClick={handleSkipToJudge}>
                    Skip & Send to Judge
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (phase === "judging" && isRunning) {
      return (
        <div className={styles.controlBar}>
          <div className={styles.phaseIndicator}>
            <div className={styles.phaseSpinner} aria-hidden />
            <span>Judge is analyzing the deliberation...</span>
          </div>
        </div>
      );
    }

    if (phase === "voting" && isRunning) {
      const voteCount = session.votes?.length ?? 0;
      const totalModels = session.settings.selectedModelIds.length;
      return (
        <div className={styles.controlBar}>
          <div className={styles.phaseIndicator}>
            <div className={styles.phaseSpinner} aria-hidden />
            <span>Models are voting... ({voteCount}/{totalModels})</span>
          </div>
        </div>
      );
    }

    if (phase === "voting" && !isRunning && session.judgeSolutions && !session.votes) {
      return (
        <div className={styles.controlBar}>
          <button type="button" className={styles.btnPrimary} onClick={handleStartVoting}>
            Start Voting
          </button>
        </div>
      );
    }

    if (phase === "complete") {
      return (
        <div className={styles.controlBar}>
          <div className={styles.completeBar}>
            <span className={styles.completeBadge}>Deliberation Complete</span>
            <Link href="/deliberation" className={styles.newDeliberationLink}>
              Start New Deliberation
            </Link>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="synapse-root">
      <div className="ambient-orb ambient-orb-violet" aria-hidden />
      <div className="ambient-orb ambient-orb-cyan" aria-hidden />

      <NavPill variant="app" />

      <main className="main-shell">
        <section className={styles.workspaceGrid}>
          <DeliberationHistoryPanel activeSessionId={id} />

          <div className={styles.chatContainer}>
            <div className={styles.chatHeader}>
              <h2 title={session.question}>{session.question}</h2>
              <div className={styles.chatMeta}>
                <span>{session.settings.selectedModelIds.length} models</span>
                <span>Phase: {session.phase}</span>
              </div>
            </div>

            <div className={styles.messageList}>
              {session.messages.length === 0 && !isRunning && (
                <div className={styles.emptyState}>
                  <p>Waiting for deliberation to begin...</p>
                </div>
              )}
              {session.messages.length === 0 && isRunning && (
                <div className={styles.emptyState}>
                  <div className={styles.phaseSpinner} aria-hidden />
                  <p>Starting deliberation...</p>
                </div>
              )}

              {session.messages.map(renderMessage)}

              {/* Compact solution pills (inside scroll area) */}
              {session.judgeSolutions && session.judgeSolutions.length > 0 && (
                <div className={styles.solutionsSection}>
                  <h3 className={styles.solutionsTitle}>Proposed Solutions</h3>
                  <div className={styles.solutionPills}>
                    {session.judgeSolutions.map((solution) => {
                      const voteCount = session.votes
                        ? session.votes.filter((v) => v.chosenSolutionId === solution.id).length
                        : 0;
                      const isWinner = winningSolutionId === solution.id;
                      return (
                        <button
                          key={solution.id}
                          type="button"
                          className={`${styles.solutionPill} ${isWinner ? styles.solutionPillWinner : ""}`}
                          onClick={() => setSelectedSolutionId(solution.id)}
                        >
                          <span className={`${styles.solutionLabel} ${isWinner ? styles.solutionLabelWinner : ""}`}>
                            {solution.label}
                          </span>
                          <span className={styles.solutionSnippet}>
                            {solution.description.length > 80
                              ? solution.description.slice(0, 80) + "..."
                              : solution.description}
                          </span>
                          {session.votes && session.votes.length > 0 && (
                            <span className={`${styles.solutionVotes} ${isWinner ? styles.solutionVotesWinner : ""}`}>
                              {voteCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Compact voting results (inside scroll area) */}
              {session.votes && session.votes.length > 0 && (
                <div className={styles.votingSection}>
                  <h3 className={styles.votingTitle}>Voting Results</h3>
                  <div className={styles.voteTally}>
                    {voteTally.map(({ solution, count }) => (
                      <button
                        key={solution.id}
                        type="button"
                        className={`${styles.tallyItem} ${
                          winningSolutionId === solution.id ? styles.tallyItemWinner : ""
                        }`}
                        onClick={() => setSelectedSolutionId(solution.id)}
                      >
                        <span className={styles.tallyLabel}>{solution.label}</span>
                        <span className={styles.tallyCount}>
                          {count} vote{count !== 1 ? "s" : ""}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className={styles.voteRows}>
                    {session.votes.map((vote) => {
                      const solution = session.judgeSolutions?.find(
                        (s) => s.id === vote.chosenSolutionId
                      );
                      return (
                        <button
                          key={vote.modelId}
                          type="button"
                          className={styles.voteRow}
                          onClick={() => solution && setSelectedSolutionId(solution.id)}
                        >
                          <span
                            className={styles.voteRowDot}
                            style={{ backgroundColor: vote.color }}
                            aria-hidden
                          />
                          <span className={styles.voteRowModel} title={getRealModelName(vote.modelId)}>{vote.modelName}</span>
                          <span className={styles.voteRowChoice}>
                            {solution?.label ?? "?"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div ref={messageEndRef} />
            </div>

            {/* Solution detail modal */}
            {selectedSolutionId && session.judgeSolutions && (() => {
              const solution = session.judgeSolutions.find((s) => s.id === selectedSolutionId);
              if (!solution) return null;
              return (
                <SolutionModal
                  solution={solution}
                  allSolutions={session.judgeSolutions}
                  votes={session.votes ?? []}
                  winningSolutionId={winningSolutionId}
                  onClose={() => setSelectedSolutionId(null)}
                  onNavigate={(id) => setSelectedSolutionId(id)}
                />
              );
            })()}

            {renderControls()}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
