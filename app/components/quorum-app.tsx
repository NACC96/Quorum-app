"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_COUNCIL,
  DEFAULT_JUDGE,
  MAX_DELIBERATION_ROUNDS,
  MIN_COUNCIL_SIZE,
  MODEL_OPTIONS,
  getModelById,
  getModelsByIds
} from "@/lib/models";
import {
  buildDeliberationPrompt,
  buildIndependentPrompt,
  buildJudgmentPrompt
} from "@/lib/prompts";
import { deleteSession, loadSessions, saveSessions, upsertSession } from "@/lib/storage";
import { ChatMessage, ModelOption, ModelResponse, Round, RoundType, Session } from "@/lib/types";

interface DraftState {
  question: string;
  context: string;
  selectedModelIds: string[];
  judgeModelId: string;
  deliberationRounds: number;
}

const METRIC_ITEMS = [
  { label: "council members", value: "2-8" },
  { label: "deliberation rounds", value: "0-3" },
  { label: "execution mode", value: "parallel" },
  { label: "provider gateway", value: "openrouter" },
  { label: "storage", value: "local" },
  { label: "verdict model", value: "configurable" }
];

const INITIAL_DRAFT: DraftState = {
  question: "",
  context: "",
  selectedModelIds: DEFAULT_COUNCIL,
  judgeModelId: DEFAULT_JUDGE,
  deliberationRounds: 1
};

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatRoundLabel(round: Round): string {
  if (round.type === "independent") {
    return "Independent";
  }

  if (round.type === "judgment") {
    return "Verdict";
  }

  return `Deliberation ${round.roundNumber - 1}`;
}

function createRound(roundNumber: number, type: RoundType, models: ModelOption[]): Round {
  return {
    id: createId(),
    roundNumber,
    type,
    status: "running",
    startedAt: new Date().toISOString(),
    responses: models.map((model) => ({
      id: `${roundNumber}-${model.id}`,
      modelId: model.id,
      modelName: model.name,
      provider: model.provider,
      color: model.color,
      content: "",
      tokenCount: 0,
      latencyMs: 0,
      status: "pending"
    }))
  };
}

function patchRound(session: Session, roundId: string, patch: Partial<Round>): Session {
  return {
    ...session,
    rounds: session.rounds.map((round) => (round.id === roundId ? { ...round, ...patch } : round)),
    updatedAt: new Date().toISOString()
  };
}

function patchRoundResponse(
  session: Session,
  roundId: string,
  modelId: string,
  patch: Partial<ModelResponse>
): Session {
  return {
    ...session,
    rounds: session.rounds.map((round) => {
      if (round.id !== roundId) {
        return round;
      }

      return {
        ...round,
        responses: round.responses.map((response) =>
          response.modelId === modelId ? { ...response, ...patch } : response
        )
      };
    }),
    updatedAt: new Date().toISOString()
  };
}

function msToSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

async function callModel(
  model: string,
  messages: ChatMessage[],
  temperature = 0.7,
  maxTokens = 1200
): Promise<{ content: string; tokenCount: number }> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      maxTokens
    })
  });

  const json = (await response.json()) as {
    content?: string;
    tokenCount?: number;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(json.error ?? "Model request failed");
  }

  if (!json.content) {
    throw new Error("Model returned an empty response");
  }

  return {
    content: json.content,
    tokenCount: json.tokenCount ?? 0
  };
}

function modelShortName(modelId: string): string {
  const model = getModelById(modelId);
  return model ? model.name : modelId;
}

interface RoundOutcome {
  modelId: string;
  status: "complete" | "error";
  content?: string;
  tokenCount?: number;
  latencyMs: number;
  error?: string;
}

export default function QuorumApp(): JSX.Element {
  const [draft, setDraft] = useState<DraftState>(INITIAL_DRAFT);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isExecuting, setIsExecuting] = useState<boolean>(false);

  useEffect(() => {
    const initial = loadSessions();
    setSessions(initial);
    if (initial.length > 0) {
      setActiveSessionId(initial[0].id);
      if (initial[0].rounds.length > 0) {
        setActiveRoundId(initial[0].rounds[initial[0].rounds.length - 1].id);
      }
    }
  }, []);

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions]
  );

  const activeRound = useMemo(() => {
    if (!activeSession || !activeRoundId) {
      return null;
    }

    return activeSession.rounds.find((round) => round.id === activeRoundId) ?? null;
  }, [activeRoundId, activeSession]);

  useEffect(() => {
    if (!activeSession) {
      setActiveRoundId(null);
      return;
    }

    if (!activeRoundId || !activeSession.rounds.some((round) => round.id === activeRoundId)) {
      const lastRound = activeSession.rounds[activeSession.rounds.length - 1];
      setActiveRoundId(lastRound ? lastRound.id : null);
    }
  }, [activeRoundId, activeSession]);

  const canRun =
    draft.question.trim().length > 0 && draft.selectedModelIds.length >= MIN_COUNCIL_SIZE && !isExecuting;

  const totalRoundsForDraft = draft.deliberationRounds + 2;

  const persistSession = (session: Session): void => {
    setSessions((previous) => upsertSession(previous, session));
    setActiveSessionId(session.id);
  };

  const persistPatchedSession = (sessionId: string, patcher: (session: Session) => Session): void => {
    setSessions((previous) => {
      const existing = previous.find((session) => session.id === sessionId);
      if (!existing) {
        return previous;
      }

      const next = patcher(existing);
      return upsertSession(previous, next);
    });
  };

  const runParticipantRound = async (
    workingSession: Session,
    round: Round,
    models: ModelOption[],
    promptBuilder: (model: ModelOption) => { system: string; user: string }
  ): Promise<Session> => {
    let nextSession = patchRound(workingSession, round.id, { status: "running" });
    persistSession(nextSession);

    const outcomes = await Promise.all(
      models.map(async (model) => {
        const started = Date.now();
        try {
          const prompt = promptBuilder(model);
          const result = await callModel(model.id, [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user }
          ]);

          const latencyMs = Date.now() - started;
          const outcome: RoundOutcome = {
            modelId: model.id,
            status: "complete",
            content: result.content,
            tokenCount: result.tokenCount,
            latencyMs
          };

          persistPatchedSession(nextSession.id, (session) =>
            patchRoundResponse(session, round.id, model.id, outcome)
          );

          return outcome;
        } catch (error) {
          const latencyMs = Date.now() - started;
          const outcome: RoundOutcome = {
            modelId: model.id,
            status: "error",
            error: error instanceof Error ? error.message : "Unknown model error",
            latencyMs
          };

          persistPatchedSession(nextSession.id, (session) =>
            patchRoundResponse(session, round.id, model.id, outcome)
          );

          return outcome;
        }
      })
    );

    for (const outcome of outcomes) {
      nextSession = patchRoundResponse(nextSession, round.id, outcome.modelId, outcome);
    }

    nextSession = patchRound(nextSession, round.id, {
      status: "complete",
      completedAt: new Date().toISOString()
    });
    persistSession(nextSession);
    return nextSession;
  };

  const runJudgmentRound = async (
    workingSession: Session,
    round: Round,
    judge: ModelOption
  ): Promise<Session> => {
    let nextSession = patchRound(workingSession, round.id, { status: "running" });
    persistSession(nextSession);

    const started = Date.now();

    try {
      const prompt = buildJudgmentPrompt(
        nextSession.question,
        nextSession.context,
        judge,
        nextSession.rounds.filter((item) => item.id !== round.id)
      );

      const result = await callModel(judge.id, [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user }
      ]);

      const latencyMs = Date.now() - started;
      nextSession = patchRoundResponse(nextSession, round.id, judge.id, {
        status: "complete",
        content: result.content,
        tokenCount: result.tokenCount,
        latencyMs
      });
    } catch (error) {
      const latencyMs = Date.now() - started;
      nextSession = patchRoundResponse(nextSession, round.id, judge.id, {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown judge error",
        latencyMs
      });
    }

    nextSession = patchRound(nextSession, round.id, {
      status: "complete",
      completedAt: new Date().toISOString()
    });
    persistSession(nextSession);

    return nextSession;
  };

  const startSession = async (): Promise<void> => {
    setErrorMessage("");

    const question = draft.question.trim();
    const selectedModelIds = [...draft.selectedModelIds];

    if (!question) {
      setErrorMessage("Question is required.");
      return;
    }

    if (selectedModelIds.length < MIN_COUNCIL_SIZE) {
      setErrorMessage(`Select at least ${MIN_COUNCIL_SIZE} council models.`);
      return;
    }

    const councilModels = getModelsByIds(selectedModelIds);
    if (councilModels.length < MIN_COUNCIL_SIZE) {
      setErrorMessage("Some selected models are unavailable.");
      return;
    }

    const judge = getModelById(draft.judgeModelId);
    if (!judge) {
      setErrorMessage("Judge model is invalid.");
      return;
    }

    setIsExecuting(true);

    let workingSession: Session = {
      id: createId(),
      question,
      context: draft.context.trim(),
      settings: {
        selectedModelIds,
        judgeModelId: draft.judgeModelId,
        deliberationRounds: draft.deliberationRounds
      },
      status: "running",
      rounds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    persistSession(workingSession);

    try {
      const independentRound = createRound(1, "independent", councilModels);
      workingSession = {
        ...workingSession,
        rounds: [...workingSession.rounds, independentRound],
        updatedAt: new Date().toISOString()
      };
      persistSession(workingSession);
      setActiveRoundId(independentRound.id);

      workingSession = await runParticipantRound(
        workingSession,
        independentRound,
        councilModels,
        (model) => buildIndependentPrompt(workingSession.question, workingSession.context, model)
      );

      for (let i = 1; i <= draft.deliberationRounds; i += 1) {
        const priorRound = workingSession.rounds[workingSession.rounds.length - 1];
        const deliberationRound = createRound(i + 1, "deliberation", councilModels);

        workingSession = {
          ...workingSession,
          rounds: [...workingSession.rounds, deliberationRound],
          updatedAt: new Date().toISOString()
        };
        persistSession(workingSession);
        setActiveRoundId(deliberationRound.id);

        workingSession = await runParticipantRound(
          workingSession,
          deliberationRound,
          councilModels,
          (model) =>
            buildDeliberationPrompt(
              workingSession.question,
              workingSession.context,
              model,
              priorRound,
              i
            )
        );
      }

      const judgmentRound = createRound(draft.deliberationRounds + 2, "judgment", [judge]);
      workingSession = {
        ...workingSession,
        rounds: [...workingSession.rounds, judgmentRound],
        updatedAt: new Date().toISOString()
      };
      persistSession(workingSession);
      setActiveRoundId(judgmentRound.id);

      workingSession = await runJudgmentRound(workingSession, judgmentRound, judge);

      workingSession = {
        ...workingSession,
        status: "complete",
        updatedAt: new Date().toISOString()
      };

      persistSession(workingSession);
    } catch (error) {
      workingSession = {
        ...workingSession,
        status: "error",
        updatedAt: new Date().toISOString()
      };
      persistSession(workingSession);
      setErrorMessage(error instanceof Error ? error.message : "Failed to execute council session.");
    } finally {
      setIsExecuting(false);
    }
  };

  const toggleModel = (modelId: string): void => {
    setDraft((previous) => {
      const exists = previous.selectedModelIds.includes(modelId);

      if (exists) {
        if (previous.selectedModelIds.length <= MIN_COUNCIL_SIZE) {
          return previous;
        }

        const nextSelected = previous.selectedModelIds.filter((id) => id !== modelId);
        return {
          ...previous,
          selectedModelIds: nextSelected
        };
      }

      return {
        ...previous,
        selectedModelIds: [...previous.selectedModelIds, modelId]
      };
    });
  };

  const selectSession = (sessionId: string): void => {
    setActiveSessionId(sessionId);
    const found = sessions.find((session) => session.id === sessionId);
    if (found && found.rounds.length > 0) {
      setActiveRoundId(found.rounds[found.rounds.length - 1].id);
    }
  };

  const removeSession = (sessionId: string): void => {
    setSessions((previous) => {
      const next = deleteSession(previous, sessionId);
      if (activeSessionId === sessionId) {
        setActiveSessionId(next[0]?.id ?? null);
        setActiveRoundId(next[0]?.rounds[next[0].rounds.length - 1]?.id ?? null);
      }
      return next;
    });
  };

  return (
    <div className="synapse-root">
      <div className="ambient-orb ambient-orb-violet" aria-hidden />
      <div className="ambient-orb ambient-orb-cyan" aria-hidden />

      <header className="nav-pill">
        <div className="brand-wrap">
          <span className="brand-dot" aria-hidden />
          <span className="brand-title">Quorum</span>
        </div>
        <nav className="nav-links" aria-label="Primary">
          <a href="#control">Council</a>
          <a href="#session">Session</a>
          <a href="#architecture">Architecture</a>
        </nav>
        <button
          type="button"
          className="nav-cta"
          onClick={() => {
            const target = document.getElementById("control");
            if (target) {
              target.scrollIntoView({ behavior: "smooth" });
            }
          }}
        >
          Convene
        </button>
      </header>

      <main className="main-shell">
        <section className="hero-section">
          <p className="hero-kicker">Council-Grade Deliberation</p>
          <h1 className="hero-title">
            Ask once. Let a council reason. Receive a final
            <span className="shimmer-word"> verdict.</span>
          </h1>
          <p className="hero-copy">
            Quorum orchestrates multi-model independent reasoning, structured deliberation, and
            judge synthesis in one controlled workflow.
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="shiny-button"
              onClick={() => {
                const target = document.getElementById("control");
                if (target) {
                  target.scrollIntoView({ behavior: "smooth" });
                }
              }}
            >
              <span>Start Council Session</span>
            </button>
            <a href="#session" className="text-link">
              View Session Workspace
            </a>
          </div>
        </section>

        <section className="metric-ticker" aria-label="System metrics">
          <div className="ticker-track">
            {[...METRIC_ITEMS, ...METRIC_ITEMS].map((item, index) => (
              <div className="ticker-item" key={`${item.label}-${index}`}>
                <span className="ticker-label">{item.label}</span>
                <span className="ticker-value">{item.value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="workspace-grid" id="control">
          <aside className="glass-card history-card">
            <div className="card-head">
              <h2>Sessions</h2>
              <span>{sessions.length}</span>
            </div>
            <div className="history-list">
              {sessions.length === 0 && <p className="empty-note">No sessions yet.</p>}
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`history-item ${session.id === activeSessionId ? "active" : ""}`}
                >
                  <button type="button" onClick={() => selectSession(session.id)}>
                    <span className="history-question">{session.question}</span>
                    <span className="history-meta">
                      {session.settings.selectedModelIds.length} models · {session.status}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="history-delete"
                    onClick={() => removeSession(session.id)}
                    aria-label="Delete session"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </aside>

          <div className="workspace-main" id="session">
            <section className="glass-card builder-card">
              <div className="card-head">
                <h2>Create Council Session</h2>
                <span>{totalRoundsForDraft} rounds total</span>
              </div>

              <label className="field-label" htmlFor="question-input">
                Question
              </label>
              <textarea
                id="question-input"
                value={draft.question}
                onChange={(event) => setDraft((prev) => ({ ...prev, question: event.target.value }))}
                placeholder="What should the council deliberate on?"
                rows={4}
              />

              <label className="field-label" htmlFor="context-input">
                Context (Optional)
              </label>
              <textarea
                id="context-input"
                value={draft.context}
                onChange={(event) => setDraft((prev) => ({ ...prev, context: event.target.value }))}
                placeholder="Constraints, goals, audience, tradeoffs, or implementation details"
                rows={4}
              />

              <div className="field-row">
                <label className="field-label" htmlFor="judge-select">
                  Judge Model
                </label>
                <select
                  id="judge-select"
                  value={draft.judgeModelId}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      judgeModelId: event.target.value
                    }))
                  }
                >
                  {MODEL_OPTIONS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} ({model.provider})
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-row">
                <label className="field-label" htmlFor="rounds-range">
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
                    setDraft((prev) => ({
                      ...prev,
                      deliberationRounds: Number(event.target.value)
                    }))
                  }
                />
              </div>

              <div className="model-grid">
                {MODEL_OPTIONS.map((model) => {
                  const selected = draft.selectedModelIds.includes(model.id);
                  return (
                    <button
                      type="button"
                      key={model.id}
                      className={`model-tile ${selected ? "selected" : ""}`}
                      onClick={() => toggleModel(model.id)}
                    >
                      <span className="model-color" style={{ backgroundColor: model.color }} aria-hidden />
                      <div className="model-copy">
                        <span className="model-name">{model.name}</span>
                        <span className="model-provider">{model.provider}</span>
                        <span className="model-description">{model.description}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {errorMessage && <p className="error-text">{errorMessage}</p>}

              <button type="button" className="launch-button" onClick={startSession} disabled={!canRun}>
                {isExecuting ? "Council In Session..." : "Convene Council"}
              </button>
            </section>

            <section className="glass-card session-card">
              <div className="card-head">
                <h2>Deliberation Workspace</h2>
                {activeSession ? (
                  <span>
                    {activeSession.settings.selectedModelIds.length} members · {activeSession.status}
                  </span>
                ) : (
                  <span>Awaiting session</span>
                )}
              </div>

              {!activeSession && (
                <div className="empty-session">
                  <p>No active session. Configure a council and run the first round.</p>
                </div>
              )}

              {activeSession && (
                <>
                  <div className="session-header">
                    <h3>{activeSession.question}</h3>
                    <p>
                      Judge: <strong>{modelShortName(activeSession.settings.judgeModelId)}</strong> ·
                      Deliberation rounds: <strong>{activeSession.settings.deliberationRounds}</strong>
                    </p>
                  </div>

                  <div className="round-tabs">
                    {activeSession.rounds.map((round) => (
                      <button
                        key={round.id}
                        type="button"
                        className={`round-tab ${round.id === activeRoundId ? "active" : ""}`}
                        onClick={() => setActiveRoundId(round.id)}
                      >
                        <span>{formatRoundLabel(round)}</span>
                        <small>{round.status}</small>
                      </button>
                    ))}
                  </div>

                  {activeRound && (
                    <div
                      className={`response-grid ${
                        activeRound.type === "judgment" ? "response-grid-judgment" : ""
                      }`}
                    >
                      {activeRound.responses.map((response) => (
                        <article key={response.id} className="response-card">
                          <header className="response-head">
                            <span className="response-model">
                              <span
                                className="response-dot"
                                style={{ backgroundColor: response.color }}
                                aria-hidden
                              />
                              {response.modelName}
                            </span>
                            <span className="response-provider">{response.provider}</span>
                          </header>

                          {response.status === "pending" && (
                            <div className="response-loading">
                              <div className="skeleton-line" />
                              <div className="skeleton-line w90" />
                              <div className="skeleton-line w70" />
                            </div>
                          )}

                          {response.status === "error" && (
                            <p className="response-error">{response.error ?? "Model execution failed."}</p>
                          )}

                          {response.status === "complete" && (
                            <div className="response-body">{response.content}</div>
                          )}

                          <footer className="response-foot">
                            <span>{response.tokenCount} tokens</span>
                            <span>{response.latencyMs > 0 ? msToSeconds(response.latencyMs) : "-"}</span>
                          </footer>
                        </article>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </section>

        <section className="feature-grid" id="architecture">
          <article className="feature-card">
            <div className="feature-icon">01</div>
            <h3>Parallel Independent Round</h3>
            <p>
              Every council member receives the same question and context simultaneously, with
              isolated reasoning before group influence.
            </p>
          </article>
          <article className="feature-card">
            <div className="feature-icon">02</div>
            <h3>Structured Deliberation Cycles</h3>
            <p>
              Models critique and refine each other over configurable rounds, creating explicit
              tradeoff analysis and stronger convergence.
            </p>
          </article>
          <article className="feature-card">
            <div className="feature-icon">03</div>
            <h3>Judge Verdict Synthesis</h3>
            <p>
              A dedicated judge evaluates the full transcript and returns consensus, disagreements,
              blind spots, and an action-ready final verdict.
            </p>
          </article>
        </section>

        <section className="code-block">
          <div className="code-toolbar">
            <div className="window-controls" aria-hidden>
              <span />
              <span />
              <span />
            </div>
            <span className="code-file">quorum.pipeline.ts</span>
            <button type="button" className="code-copy" disabled>
              COPY
            </button>
          </div>
          <pre>
            <code>
{`const council = await runIndependentRound(models, question, context);

for (let i = 0; i < deliberationRounds; i++) {
  const prior = rounds[rounds.length - 1];
  const deliberation = await runDeliberationRound(models, prior, question, context);
  rounds.push(deliberation);
}

const verdict = await runJudgeRound(judgeModel, rounds, question, context);
return { rounds, verdict };`}
            </code>
          </pre>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-grid">
          <div>
            <h4 className="footer-brand">Quorum</h4>
            <p className="footer-copy">Council-style synthesis for high-stakes decisions.</p>
          </div>
          <div>
            <h5>Workflow</h5>
            <p>Seed question, independent reasoning, deliberation, verdict.</p>
          </div>
          <div>
            <h5>Runtime</h5>
            <p>OpenRouter gateway, local persistence, server-side API key handling.</p>
          </div>
          <div>
            <h5>Status</h5>
            <p>Web-only v1 with configurable model councils.</p>
          </div>
        </div>
        <div className="footer-bar">
          <span>© {new Date().getFullYear()} Quorum</span>
          <span className="status-ok">
            <i aria-hidden /> All Systems Operational
          </span>
        </div>
      </footer>
    </div>
  );
}
