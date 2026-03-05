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
  Session
} from "@/lib/types";
import { getModelById, getModelsByIds } from "@/lib/models";
import {
  buildDeliberationPrompt,
  buildIndependentPrompt,
  buildJudgmentPrompt
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

export function createRound(roundNumber: number, type: RoundType, models: ModelOption[]): Round {
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

async function runJudgmentRound(
  workingSession: Session,
  round: Round,
  judge: ModelOption,
  persistFull: (session: Session) => void
): Promise<Session> {
  let nextSession = patchRound(workingSession, round.id, { status: "running" });
  persistFull(nextSession);

  const started = Date.now();
  const prompt = buildJudgmentPrompt(
    nextSession.question,
    nextSession.context,
    judge,
    nextSession.rounds.filter((item) => item.id !== round.id)
  );
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

export async function executeCouncilSession(
  initialSession: Session,
  persistFull: (session: Session) => void,
  persistPatch: (patcher: (session: Session) => Session) => void,
  onRoundActivated?: (roundId: string) => void
): Promise<Session> {
  const councilModels = getModelsByIds(initialSession.settings.selectedModelIds);
  const judge = getModelById(initialSession.settings.judgeModelId);

  if (!judge) {
    throw new Error("Judge model is invalid.");
  }

  let workingSession = initialSession;

  // Independent round
  const independentRound = createRound(1, "independent", councilModels);
  workingSession = {
    ...workingSession,
    rounds: [...workingSession.rounds, independentRound],
    updatedAt: new Date().toISOString()
  };
  persistFull(workingSession);
  onRoundActivated?.(independentRound.id);

  workingSession = await runParticipantRound(
    workingSession,
    independentRound,
    councilModels,
    (model) => buildIndependentPrompt(workingSession.question, workingSession.context, model),
    persistFull,
    persistPatch
  );

  // Deliberation rounds
  for (let i = 1; i <= initialSession.settings.deliberationRounds; i += 1) {
    const priorRound = workingSession.rounds[workingSession.rounds.length - 1];
    const deliberationRound = createRound(i + 1, "deliberation", councilModels);

    workingSession = {
      ...workingSession,
      rounds: [...workingSession.rounds, deliberationRound],
      updatedAt: new Date().toISOString()
    };
    persistFull(workingSession);
    onRoundActivated?.(deliberationRound.id);

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
        ),
      persistFull,
      persistPatch
    );
  }

  // Judgment round
  const judgmentRound = createRound(initialSession.settings.deliberationRounds + 2, "judgment", [judge]);
  workingSession = {
    ...workingSession,
    rounds: [...workingSession.rounds, judgmentRound],
    updatedAt: new Date().toISOString()
  };
  persistFull(workingSession);
  onRoundActivated?.(judgmentRound.id);

  workingSession = await runJudgmentRound(workingSession, judgmentRound, judge, persistFull);

  // Mark complete
  workingSession = {
    ...workingSession,
    status: "complete",
    updatedAt: new Date().toISOString()
  };
  persistFull(workingSession);

  // Generate title in background (non-blocking)
  generateSessionTitle(workingSession.question, workingSession.context).then((title) => {
    if (title) {
      persistPatch((s) => ({ ...s, title, updatedAt: new Date().toISOString() }));
    }
  }).catch(() => {
    // Silent failure — sidebar falls back to showing the question
  });

  return workingSession;
}

export async function retryFailedModelsForRound(
  session: Session,
  roundId: string,
  persistFull: (session: Session) => void,
  persistPatch: (patcher: (session: Session) => Session) => void
): Promise<Session> {
  const round = session.rounds.find((item) => item.id === roundId);
  if (!round) {
    throw new Error("Round not found.");
  }

  const failedResponses = round.responses.filter((response) => response.status === "error");
  if (failedResponses.length === 0) {
    return session;
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

  if (round.type === "judgment") {
    const judge = getModelById(workingSession.settings.judgeModelId);
    if (!judge) {
      throw new Error("Judge model is invalid.");
    }

    return runJudgmentRound(workingSession, refreshedRound, judge, persistFull);
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

  const priorRound = workingSession.rounds.find((item) => item.roundNumber === round.roundNumber - 1);
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
        round.roundNumber - 1
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
