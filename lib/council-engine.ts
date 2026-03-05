import {
  ChatResult,
  ChatMessage,
  ModelInputMessage,
  ModelOption,
  ModelResponse,
  ReasoningEffort,
  Round,
  RoundOutcome,
  RoundType,
  SummarySourceRoundType,
  Session
} from "@/lib/types";
import {
  DEFAULT_REASONING_EFFORT,
  DEFAULT_SUMMARY_MODEL,
  getModelById,
  getModelsByIds
} from "@/lib/models";
import {
  buildDeliberationPrompt,
  buildIndependentPrompt,
  buildJudgmentPrompt,
  buildSummaryPrompt
} from "@/lib/prompts";

class ModelRequestError extends Error {
  readonly reason?: string;
  readonly requestId?: string;

  constructor(message: string, reason?: string, requestId?: string) {
    super(message);
    this.name = "ModelRequestError";
    this.reason = reason;
    this.requestId = requestId;
  }
}

const inFlightModelControllers = new Map<string, AbortController>();

function inFlightModelKey(sessionId: string, roundId: string, modelId: string): string {
  return `${sessionId}:${roundId}:${modelId}`;
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === "AbortError") {
    return true;
  }

  return error.message.toLowerCase().includes("aborted");
}

async function callModelForRound(
  sessionId: string,
  roundId: string,
  modelId: string,
  run: (signal: AbortSignal) => Promise<ChatResult>
): Promise<ChatResult> {
  const key = inFlightModelKey(sessionId, roundId, modelId);
  const controller = new AbortController();
  inFlightModelControllers.set(key, controller);

  try {
    return await run(controller.signal);
  } finally {
    const current = inFlightModelControllers.get(key);
    if (current === controller) {
      inFlightModelControllers.delete(key);
    }
  }
}

export function abortInFlightModelRequest(sessionId: string, roundId: string, modelId: string): boolean {
  const key = inFlightModelKey(sessionId, roundId, modelId);
  const controller = inFlightModelControllers.get(key);
  if (!controller) {
    return false;
  }

  inFlightModelControllers.delete(key);
  controller.abort();
  return true;
}

function toModelRequestError(error: unknown): ModelRequestError {
  if (error instanceof ModelRequestError) {
    return error;
  }

  if (error instanceof Error) {
    return new ModelRequestError(error.message);
  }

  return new ModelRequestError("Unknown model error");
}

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface RoundCreationOptions {
  deliberationIndex?: number;
  summarySourceRoundId?: string;
  summarySourceRoundType?: SummarySourceRoundType;
  summarySourceDeliberationIndex?: number;
}

export function createRound(
  roundNumber: number,
  type: RoundType,
  models: ModelOption[],
  options: RoundCreationOptions = {}
): Round {
  return {
    id: createId(),
    roundNumber,
    type,
    status: "running",
    deliberationIndex: options.deliberationIndex,
    summarySourceRoundId: options.summarySourceRoundId,
    summarySourceRoundType: options.summarySourceRoundType,
    summarySourceDeliberationIndex: options.summarySourceDeliberationIndex,
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
      status: "pending" as const
    }))
  };
}

export function patchRound(session: Session, roundId: string, patch: Partial<Round>): Session {
  return {
    ...session,
    rounds: session.rounds.map((round) => (round.id === roundId ? { ...round, ...patch } : round)),
    updatedAt: new Date().toISOString()
  };
}

export function patchRoundResponse(
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

export async function callModel(
  model: string,
  messages: ChatMessage[],
  temperature = 0.7,
  maxTokens = 65536,
  reasoningEffort?: ReasoningEffort,
  signal?: AbortSignal
): Promise<ChatResult> {
  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature,
    maxTokens
  };

  if (reasoningEffort && reasoningEffort !== "none") {
    payload.reasoningEffort = reasoningEffort;
  }

  let response: Response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new ModelRequestError("Model request was aborted.", "Request was aborted manually.");
    }

    throw error;
  }

  const json = (await response.json()) as {
    content?: string;
    tokenCount?: number;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      costUsd?: number;
      costSource?: "provider" | "calculated" | "unavailable";
    };
    error?: string;
    reason?: string;
    requestId?: string;
  };

  if (!response.ok) {
    throw new ModelRequestError(json.error ?? "Model request failed", json.reason, json.requestId);
  }

  if (!json.content) {
    throw new Error("Model returned an empty response");
  }

  const totalTokens = json.usage?.totalTokens ?? json.tokenCount ?? 0;

  return {
    content: json.content,
    tokenCount: totalTokens,
    usage: {
      promptTokens: json.usage?.promptTokens,
      completionTokens: json.usage?.completionTokens,
      totalTokens,
      costUsd: json.usage?.costUsd,
      costSource: json.usage?.costSource
    }
  };
}

async function runParticipantRound(
  workingSession: Session,
  round: Round,
  models: ModelOption[],
  promptBuilder: (model: ModelOption) => { system: string; user: string },
  persistFull: (session: Session) => void,
  persistPatch: (patcher: (session: Session) => Session) => void
): Promise<Session> {
  let nextSession = patchRound(workingSession, round.id, { status: "running" });
  persistFull(nextSession);

  const outcomes = await Promise.all(
    models.map(async (model) => {
      const started = Date.now();
      const prompt = promptBuilder(model);
      const inputMessages: ModelInputMessage[] = [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user }
      ];

      try {
        const effort = workingSession.settings.reasoningEffortMap?.[model.id];
        const result = await callModelForRound(
          workingSession.id,
          round.id,
          model.id,
          (signal) => callModel(
            model.id,
            inputMessages,
            0.7,
            65536,
            effort,
            signal
          )
        );

        const latencyMs = Date.now() - started;
        const outcome: RoundOutcome = {
          modelId: model.id,
          status: "complete",
          content: result.content,
          tokenCount: result.usage.totalTokens,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          costUsd: result.usage.costUsd,
          costSource: result.usage.costSource,
          latencyMs,
          inputMessages
        };

        persistPatch((session) =>
          patchRoundResponse(session, round.id, model.id, outcome)
        );

        return outcome;
      } catch (error) {
        const latencyMs = Date.now() - started;
        const requestError = toModelRequestError(error);
        const outcome: RoundOutcome = {
          modelId: model.id,
          status: "error",
          error: requestError.message,
          errorReason: requestError.reason,
          errorRequestId: requestError.requestId,
          latencyMs,
          inputMessages
        };

        persistPatch((session) =>
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
  persistFull(nextSession);
  return nextSession;
}

const SUMMARY_FAILURE_MESSAGE = "Summary generation failed. Retry this summary round to continue.";

function getNextRoundNumber(session: Session): number {
  return session.rounds.length + 1;
}

function getSummaryModel(session: Session): ModelOption | undefined {
  return getModelById(session.settings.summaryModelId ?? DEFAULT_SUMMARY_MODEL);
}

function isSummaryEnabled(session: Session): boolean {
  return Boolean(session.settings.summaryEnabled);
}

function isRoundFailed(round: Round | undefined): boolean {
  return Boolean(round?.responses.some((response) => response.status === "error"));
}

function getJudgmentSourceRounds(session: Session, judgmentRoundId?: string): Round[] {
  return session.rounds.filter((round) => {
    if (round.id === judgmentRoundId) {
      return false;
    }

    if (isSummaryEnabled(session)) {
      return round.type === "summary";
    }

    return round.type === "independent" || round.type === "deliberation";
  });
}

function appendRoundToSession(
  session: Session,
  round: Round,
  persistFull: (session: Session) => void,
  onRoundActivated?: (roundId: string) => void
): Session {
  const nextSession = {
    ...session,
    rounds: [...session.rounds, round],
    updatedAt: new Date().toISOString()
  };

  persistFull(nextSession);
  onRoundActivated?.(round.id);
  return nextSession;
}

async function runSummaryRound(
  workingSession: Session,
  round: Round,
  summaryModel: ModelOption,
  sourceRound: Round,
  persistFull: (session: Session) => void
): Promise<Session> {
  let nextSession = patchRound(workingSession, round.id, { status: "running" });
  persistFull(nextSession);

  const started = Date.now();
  const prompt = buildSummaryPrompt(nextSession.question, nextSession.context, sourceRound);
  const inputMessages: ModelInputMessage[] = [
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user }
  ];

  try {
    const result = await callModelForRound(
      nextSession.id,
      round.id,
      summaryModel.id,
      (signal) => callModel(
        summaryModel.id,
        inputMessages,
        0.7,
        65536,
        DEFAULT_REASONING_EFFORT,
        signal
      )
    );

    const latencyMs = Date.now() - started;
    nextSession = patchRoundResponse(nextSession, round.id, summaryModel.id, {
      status: "complete",
      content: result.content,
      tokenCount: result.usage.totalTokens,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      costUsd: result.usage.costUsd,
      costSource: result.usage.costSource,
      latencyMs,
      inputMessages
    });
  } catch (error) {
    const latencyMs = Date.now() - started;
    const requestError = toModelRequestError(error);
    nextSession = patchRoundResponse(nextSession, round.id, summaryModel.id, {
      status: "error",
      error: requestError.message,
      errorReason: requestError.reason,
      errorRequestId: requestError.requestId,
      latencyMs,
      inputMessages
    });
  }

  nextSession = patchRound(nextSession, round.id, {
    status: "complete",
    completedAt: new Date().toISOString()
  });
  persistFull(nextSession);

  return nextSession;
}

async function runJudgmentRound(
  workingSession: Session,
  round: Round,
  judge: ModelOption,
  sourceRounds: Round[],
  persistFull: (session: Session) => void
): Promise<Session> {
  let nextSession = patchRound(workingSession, round.id, { status: "running" });
  persistFull(nextSession);

  const started = Date.now();
  const prompt = buildJudgmentPrompt(nextSession.question, nextSession.context, judge, sourceRounds);
  const inputMessages: ModelInputMessage[] = [
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user }
  ];

  try {
    const result = await callModelForRound(
      nextSession.id,
      round.id,
      judge.id,
      (signal) => callModel(
        judge.id,
        inputMessages,
        0.7,
        65536,
        nextSession.settings.judgeReasoningEffort,
        signal
      )
    );

    const latencyMs = Date.now() - started;
    nextSession = patchRoundResponse(nextSession, round.id, judge.id, {
      status: "complete",
      content: result.content,
      tokenCount: result.usage.totalTokens,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      costUsd: result.usage.costUsd,
      costSource: result.usage.costSource,
      latencyMs,
      inputMessages
    });
  } catch (error) {
    const latencyMs = Date.now() - started;
    const requestError = toModelRequestError(error);
    nextSession = patchRoundResponse(nextSession, round.id, judge.id, {
      status: "error",
      error: requestError.message,
      errorReason: requestError.reason,
      errorRequestId: requestError.requestId,
      latencyMs,
      inputMessages
    });
  }

  nextSession = patchRound(nextSession, round.id, {
    status: "complete",
    completedAt: new Date().toISOString()
  });
  persistFull(nextSession);

  return nextSession;
}

async function appendIndependentRound(
  workingSession: Session,
  councilModels: ModelOption[],
  persistFull: (session: Session) => void,
  persistPatch: (patcher: (session: Session) => Session) => void,
  onRoundActivated?: (roundId: string) => void
): Promise<Session> {
  const independentRound = createRound(getNextRoundNumber(workingSession), "independent", councilModels);
  const nextSession = appendRoundToSession(workingSession, independentRound, persistFull, onRoundActivated);

  return runParticipantRound(
    nextSession,
    independentRound,
    councilModels,
    (model) => buildIndependentPrompt(nextSession.question, nextSession.context, model),
    persistFull,
    persistPatch
  );
}

async function appendDeliberationRound(
  workingSession: Session,
  councilModels: ModelOption[],
  priorRound: Round,
  deliberationIndex: number,
  persistFull: (session: Session) => void,
  persistPatch: (patcher: (session: Session) => Session) => void,
  onRoundActivated?: (roundId: string) => void
): Promise<Session> {
  const deliberationRound = createRound(
    getNextRoundNumber(workingSession),
    "deliberation",
    councilModels,
    { deliberationIndex }
  );
  const nextSession = appendRoundToSession(workingSession, deliberationRound, persistFull, onRoundActivated);

  return runParticipantRound(
    nextSession,
    deliberationRound,
    councilModels,
    (model) =>
      buildDeliberationPrompt(
        nextSession.question,
        nextSession.context,
        model,
        priorRound,
        deliberationIndex
      ),
    persistFull,
    persistPatch
  );
}

async function appendSummaryRound(
  workingSession: Session,
  summaryModel: ModelOption,
  sourceRound: Round,
  persistFull: (session: Session) => void,
  onRoundActivated?: (roundId: string) => void
): Promise<Session> {
  const summaryRound = createRound(
    getNextRoundNumber(workingSession),
    "summary",
    [summaryModel],
    {
      summarySourceRoundId: sourceRound.id,
      summarySourceRoundType: sourceRound.type === "deliberation" ? "deliberation" : "independent",
      summarySourceDeliberationIndex: sourceRound.type === "deliberation" ? sourceRound.deliberationIndex : undefined
    }
  );
  const nextSession = appendRoundToSession(workingSession, summaryRound, persistFull, onRoundActivated);

  return runSummaryRound(nextSession, summaryRound, summaryModel, sourceRound, persistFull);
}

async function appendJudgmentRound(
  workingSession: Session,
  judge: ModelOption,
  persistFull: (session: Session) => void,
  onRoundActivated?: (roundId: string) => void
): Promise<Session> {
  const judgmentRound = createRound(getNextRoundNumber(workingSession), "judgment", [judge]);
  const nextSession = appendRoundToSession(workingSession, judgmentRound, persistFull, onRoundActivated);

  return runJudgmentRound(
    nextSession,
    judgmentRound,
    judge,
    getJudgmentSourceRounds(nextSession, judgmentRound.id),
    persistFull
  );
}

function finalizeCompletedSession(
  session: Session,
  persistFull: (session: Session) => void,
  persistPatch: (patcher: (session: Session) => Session) => void
): Session {
  const nextSession = {
    ...session,
    status: "complete" as const,
    updatedAt: new Date().toISOString()
  };
  persistFull(nextSession);

  if (!nextSession.title) {
    generateSessionTitle(nextSession.question, nextSession.context).then((title) => {
      if (title) {
        persistPatch((s) => ({ ...s, title, updatedAt: new Date().toISOString() }));
      }
    }).catch(() => {
      // Silent failure — sidebar falls back to showing the question
    });
  }

  return nextSession;
}

async function continueCouncilSession(
  initialSession: Session,
  persistFull: (session: Session) => void,
  persistPatch: (patcher: (session: Session) => Session) => void,
  onRoundActivated?: (roundId: string) => void
): Promise<Session> {
  const councilModels = getModelsByIds(initialSession.settings.selectedModelIds);
  const judge = getModelById(initialSession.settings.judgeModelId);
  const summaryEnabled = isSummaryEnabled(initialSession);
  const summaryModel = summaryEnabled ? getSummaryModel(initialSession) : undefined;

  if (!judge) {
    throw new Error("Judge model is invalid.");
  }

  if (summaryEnabled && !summaryModel) {
    throw new Error("Summary model is invalid.");
  }

  let workingSession = initialSession;

  while (true) {
    const lastRound = workingSession.rounds[workingSession.rounds.length - 1];

    if (!lastRound) {
      workingSession = await appendIndependentRound(
        workingSession,
        councilModels,
        persistFull,
        persistPatch,
        onRoundActivated
      );
      continue;
    }

    if (lastRound.type === "summary") {
      if (isRoundFailed(lastRound)) {
        throw new Error(SUMMARY_FAILURE_MESSAGE);
      }

      const nextDeliberationIndex =
        lastRound.summarySourceRoundType === "independent"
          ? 1
          : (lastRound.summarySourceDeliberationIndex ?? 0) + 1;

      if (nextDeliberationIndex <= initialSession.settings.deliberationRounds) {
        workingSession = await appendDeliberationRound(
          workingSession,
          councilModels,
          lastRound,
          nextDeliberationIndex,
          persistFull,
          persistPatch,
          onRoundActivated
        );
        continue;
      }

      workingSession = await appendJudgmentRound(workingSession, judge, persistFull, onRoundActivated);
      return finalizeCompletedSession(workingSession, persistFull, persistPatch);
    }

    if (lastRound.type === "independent") {
      if (summaryEnabled && summaryModel) {
        workingSession = await appendSummaryRound(
          workingSession,
          summaryModel,
          lastRound,
          persistFull,
          onRoundActivated
        );
        if (isRoundFailed(workingSession.rounds[workingSession.rounds.length - 1])) {
          throw new Error(SUMMARY_FAILURE_MESSAGE);
        }
        continue;
      }

      if (initialSession.settings.deliberationRounds > 0) {
        workingSession = await appendDeliberationRound(
          workingSession,
          councilModels,
          lastRound,
          1,
          persistFull,
          persistPatch,
          onRoundActivated
        );
        continue;
      }

      workingSession = await appendJudgmentRound(workingSession, judge, persistFull, onRoundActivated);
      return finalizeCompletedSession(workingSession, persistFull, persistPatch);
    }

    if (lastRound.type === "deliberation") {
      if (summaryEnabled && summaryModel) {
        workingSession = await appendSummaryRound(
          workingSession,
          summaryModel,
          lastRound,
          persistFull,
          onRoundActivated
        );
        if (isRoundFailed(workingSession.rounds[workingSession.rounds.length - 1])) {
          throw new Error(SUMMARY_FAILURE_MESSAGE);
        }
        continue;
      }

      const nextDeliberationIndex = (lastRound.deliberationIndex ?? 0) + 1;
      if (nextDeliberationIndex <= initialSession.settings.deliberationRounds) {
        workingSession = await appendDeliberationRound(
          workingSession,
          councilModels,
          lastRound,
          nextDeliberationIndex,
          persistFull,
          persistPatch,
          onRoundActivated
        );
        continue;
      }

      workingSession = await appendJudgmentRound(workingSession, judge, persistFull, onRoundActivated);
      return finalizeCompletedSession(workingSession, persistFull, persistPatch);
    }

    if (lastRound.type === "judgment") {
      return finalizeCompletedSession(workingSession, persistFull, persistPatch);
    }
  }
}

export async function executeCouncilSession(
  initialSession: Session,
  persistFull: (session: Session) => void,
  persistPatch: (patcher: (session: Session) => Session) => void,
  onRoundActivated?: (roundId: string) => void
): Promise<Session> {
  return continueCouncilSession(initialSession, persistFull, persistPatch, onRoundActivated);
}

export async function retryFailedModelsForRound(
  session: Session,
  roundId: string,
  persistFull: (session: Session) => void,
  persistPatch: (patcher: (session: Session) => Session) => void,
  onRoundActivated?: (roundId: string) => void
): Promise<Session> {
  const roundIndex = session.rounds.findIndex((item) => item.id === roundId);
  if (roundIndex === -1) {
    throw new Error("Round not found.");
  }

  const round = session.rounds[roundIndex];
  const failedResponses = round.responses.filter((response) => response.status === "error");
  if (failedResponses.length === 0) {
    return session;
  }

  if (isSummaryEnabled(session) && roundIndex !== session.rounds.length - 1) {
    throw new Error("Only the latest failed round can be retried when summaries are enabled.");
  }

  let workingSession = session;

  for (const response of failedResponses) {
    workingSession = patchRoundResponse(workingSession, round.id, response.modelId, {
      status: "pending",
      content: "",
      tokenCount: 0,
      promptTokens: undefined,
      completionTokens: undefined,
      costUsd: undefined,
      costSource: undefined,
      latencyMs: 0,
      error: undefined,
      errorReason: undefined,
      errorRequestId: undefined,
      inputMessages: undefined
    });
  }

  workingSession = patchRound(workingSession, round.id, {
    status: "running",
    completedAt: undefined
  });
  persistFull(workingSession);

  const refreshedRound = workingSession.rounds.find((item) => item.id === round.id) ?? round;

  if (round.type === "summary") {
    const summaryModel = getSummaryModel(workingSession);
    if (!summaryModel) {
      throw new Error("Summary model is invalid.");
    }

    const sourceRound = workingSession.rounds.find((item) => item.id === round.summarySourceRoundId);
    if (!sourceRound) {
      throw new Error("Cannot retry summary round without its source round.");
    }

    workingSession = await runSummaryRound(workingSession, refreshedRound, summaryModel, sourceRound, persistFull);
    if (isRoundFailed(workingSession.rounds.find((item) => item.id === round.id))) {
      return workingSession;
    }

    return continueCouncilSession(workingSession, persistFull, persistPatch, onRoundActivated);
  }

  if (round.type === "judgment") {
    const judge = getModelById(workingSession.settings.judgeModelId);
    if (!judge) {
      throw new Error("Judge model is invalid.");
    }

    return runJudgmentRound(
      workingSession,
      refreshedRound,
      judge,
      getJudgmentSourceRounds(workingSession, refreshedRound.id),
      persistFull
    );
  }

  const failedModelEntries = failedResponses.map((response) => ({
    modelId: response.modelId,
    model: getModelById(response.modelId)
  }));

  const missingModelIds = failedModelEntries
    .filter((entry) => !entry.model)
    .map((entry) => entry.modelId);

  for (const missingModelId of missingModelIds) {
    const outcome: RoundOutcome = {
      modelId: missingModelId,
      status: "error",
      error: "Model is no longer available in configuration.",
      errorReason: "Model removed from available options",
      latencyMs: 0
    };

    workingSession = patchRoundResponse(workingSession, round.id, missingModelId, outcome);
    persistPatch((current) => patchRoundResponse(current, round.id, missingModelId, outcome));
  }

  const retryModels = failedModelEntries
    .map((entry) => entry.model)
    .filter((model): model is ModelOption => Boolean(model));

  if (retryModels.length === 0) {
    workingSession = patchRound(workingSession, round.id, {
      status: "complete",
      completedAt: new Date().toISOString()
    });
    persistFull(workingSession);
    return workingSession;
  }

  if (round.type === "independent") {
    return runParticipantRound(
      workingSession,
      refreshedRound,
      retryModels,
      (model) => buildIndependentPrompt(workingSession.question, workingSession.context, model),
      persistFull,
      persistPatch
    );
  }

  const priorRound = workingSession.rounds[roundIndex - 1];
  if (!priorRound) {
    throw new Error("Cannot retry deliberation round without prior round context.");
  }

  return runParticipantRound(
    workingSession,
    refreshedRound,
    retryModels,
    (model) =>
      buildDeliberationPrompt(
        workingSession.question,
        workingSession.context,
        model,
        priorRound,
        refreshedRound.deliberationIndex ?? 1
      ),
    persistFull,
    persistPatch
  );
}

const TITLE_MODEL = "google/gemini-3-flash-preview";

async function generateSessionTitle(question: string, context: string): Promise<string | null> {
  const userContent = context
    ? `Question: ${question}\nContext: ${context}`
    : question;

  try {
    const result = await callModel(
      TITLE_MODEL,
      [
        {
          role: "system",
          content:
            "You are a title generator. Given a user's question and optional context, generate a concise 3-6 word title that captures the topic. Return ONLY the title text, no quotes, no punctuation at the end."
        },
        { role: "user", content: userContent }
      ],
      0.3,
      50
    );

    const title = result.content.replace(/^["']|["']$/g, "").trim();
    return title || null;
  } catch {
    return null;
  }
}
