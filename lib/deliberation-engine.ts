import {
  ChatMessage,
  CostSource,
  DeliberationMessage,
  DeliberationPhase,
  DeliberationSession,
  DeliberationSettings,
  JudgeSolution,
  ModelVote,
  ReasoningEffort,
} from "@/lib/types";
import { getModelById, getModelsByIds } from "@/lib/models";
import { getArchetypeById } from "@/lib/archetypes";
import {
  buildDeliberationTurnPrompt,
  buildJudgeSolutionPrompt,
  buildVotePrompt,
} from "@/lib/deliberation-prompts";

// --- ID generation ---

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// --- Archetype helpers ---

function getArchetypeSnippet(
  session: DeliberationSession,
  modelId: string
): string | undefined {
  const map = session.settings.archetypeMap;
  if (!map) return undefined;
  const slotIndex = session.settings.selectedModelIds.indexOf(modelId);
  if (slotIndex === -1) return undefined;
  const archetypeId = map[slotIndex];
  if (!archetypeId) return undefined;
  return getArchetypeById(archetypeId)?.systemPromptSnippet;
}

function getJudgeArchetypeSnippet(
  session: DeliberationSession
): string | undefined {
  const archetypeId = session.settings.judgeArchetypeId;
  if (!archetypeId) return undefined;
  return getArchetypeById(archetypeId)?.systemPromptSnippet;
}

// --- Streaming model call helper ---

interface StreamCallbacks {
  onChunk: (content: string) => void;
  onComplete: (usage: {
    totalTokens: number;
    promptTokens?: number;
    completionTokens?: number;
    costUsd?: number;
    costSource?: CostSource;
  }) => void;
}

async function callModelStreaming(
  modelId: string,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  reasoningEffort?: ReasoningEffort,
  signal?: AbortSignal
): Promise<string> {
  const payload: Record<string, unknown> = {
    model: modelId,
    messages,
    temperature: 0.7,
    maxTokens: 65536,
  };

  if (reasoningEffort && reasoningEffort !== "none") {
    payload.reasoningEffort = reasoningEffort;
  }

  // Try streaming endpoint first
  let fullContent = "";
  try {
    const streamResponse = await fetch("/api/chat-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });

    if (streamResponse.ok && streamResponse.body) {
      const reader = streamResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data) as {
              content?: string;
              done?: boolean;
              usage?: {
                totalTokens?: number;
                promptTokens?: number;
                completionTokens?: number;
                costUsd?: number;
                costSource?: CostSource;
              };
            };

            if (parsed.content) {
              fullContent += parsed.content;
              callbacks.onChunk(parsed.content);
            }

            if (parsed.done && parsed.usage) {
              callbacks.onComplete({
                totalTokens: parsed.usage.totalTokens ?? 0,
                promptTokens: parsed.usage.promptTokens,
                completionTokens: parsed.usage.completionTokens,
                costUsd: parsed.usage.costUsd,
                costSource: parsed.usage.costSource,
              });
              return fullContent;
            }
          } catch {
            // Skip unparseable SSE lines
          }
        }
      }

      // Stream ended without a done event — fire complete with what we have
      if (fullContent) {
        callbacks.onComplete({ totalTokens: 0 });
        return fullContent;
      }
    }

    // If streaming didn't produce content, fall through to non-streaming
  } catch {
    // Streaming failed — fall back to non-streaming
  }

  // Fallback: non-streaming /api/chat
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  const json = (await response.json()) as {
    content?: string;
    tokenCount?: number;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      costUsd?: number;
      costSource?: CostSource;
    };
    error?: string;
  };

  if (!response.ok || !json.content) {
    throw new Error(json.error ?? "Model returned an empty response");
  }

  fullContent = json.content;
  callbacks.onChunk(fullContent);
  callbacks.onComplete({
    totalTokens: json.usage?.totalTokens ?? json.tokenCount ?? 0,
    promptTokens: json.usage?.promptTokens,
    completionTokens: json.usage?.completionTokens,
    costUsd: json.usage?.costUsd,
    costSource: json.usage?.costSource,
  });

  return fullContent;
}

// --- Session creation ---

export function createDeliberationSession(
  question: string,
  context: string,
  settings: DeliberationSettings
): DeliberationSession {
  return {
    id: createId(),
    question,
    context,
    settings,
    messages: [],
    phase: "deliberating",
    currentTurn: 0,
    totalTurnsInBatch: settings.turnsPerBatch,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// --- Add user message ---

export function addUserMessage(
  session: DeliberationSession,
  content: string
): DeliberationSession {
  const message: DeliberationMessage = {
    id: createId(),
    role: "user",
    content,
    timestamp: new Date().toISOString(),
    status: "complete",
  };

  return {
    ...session,
    messages: [...session.messages, message],
    phase: "deliberating",
    updatedAt: new Date().toISOString(),
  };
}

// --- Execute a batch of deliberation turns ---

export interface BatchCallbacks {
  onTurnStart: (modelId: string, turnNumber: number) => void;
  onChunk: (content: string) => void;
  onTurnComplete: (message: DeliberationMessage) => void;
  onBatchComplete: (session: DeliberationSession) => void;
}

export async function executeDeliberationBatch(
  session: DeliberationSession,
  callbacks: BatchCallbacks,
  signal?: AbortSignal
): Promise<DeliberationSession> {
  let workingSession = { ...session, phase: "deliberating" as DeliberationPhase };
  const modelIds = workingSession.settings.selectedModelIds;
  const modelCount = modelIds.length;
  const turnsToRun = workingSession.totalTurnsInBatch;

  for (let i = 0; i < turnsToRun; i++) {
    if (signal?.aborted) break;

    const turnIndex = workingSession.currentTurn;
    const modelId = modelIds[turnIndex % modelCount];
    const model = getModelById(modelId);
    if (!model) continue;

    callbacks.onTurnStart(modelId, turnIndex);

    const pendingMessage: DeliberationMessage = {
      id: createId(),
      role: "model",
      modelId: model.id,
      modelName: model.name,
      color: model.color,
      content: "",
      timestamp: new Date().toISOString(),
      status: "streaming",
    };

    workingSession = {
      ...workingSession,
      messages: [...workingSession.messages, pendingMessage],
      updatedAt: new Date().toISOString(),
    };

    const archetypeSnippet = getArchetypeSnippet(workingSession, modelId);
    const prompt = buildDeliberationTurnPrompt(workingSession, modelId, archetypeSnippet);
    const inputMessages: ChatMessage[] = [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ];

    const effort = workingSession.settings.reasoningEffortMap?.[modelId];
    const started = Date.now();

    try {
      const fullContent = await callModelStreaming(
        modelId,
        inputMessages,
        {
          onChunk: (chunk) => callbacks.onChunk(chunk),
          onComplete: (usage) => {
            const latencyMs = Date.now() - started;
            const completedMessage: DeliberationMessage = {
              ...pendingMessage,
              content: fullContent,
              tokenCount: usage.totalTokens,
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              costUsd: usage.costUsd,
              costSource: usage.costSource,
              latencyMs,
              status: "complete",
            };

            // Update the message in working session
            workingSession = {
              ...workingSession,
              messages: workingSession.messages.map((m) =>
                m.id === pendingMessage.id ? completedMessage : m
              ),
              currentTurn: turnIndex + 1,
              updatedAt: new Date().toISOString(),
            };

            callbacks.onTurnComplete(completedMessage);
          },
        },
        effort,
        signal
      );

      // Ensure content is captured even if onComplete already updated
      workingSession = {
        ...workingSession,
        messages: workingSession.messages.map((m) =>
          m.id === pendingMessage.id && m.status === "streaming"
            ? { ...m, content: fullContent, status: "complete" as const, latencyMs: Date.now() - started }
            : m
        ),
        currentTurn: turnIndex + 1,
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      const latencyMs = Date.now() - started;
      const errorMessage: DeliberationMessage = {
        ...pendingMessage,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
        latencyMs,
      };

      workingSession = {
        ...workingSession,
        messages: workingSession.messages.map((m) =>
          m.id === pendingMessage.id ? errorMessage : m
        ),
        currentTurn: turnIndex + 1,
        updatedAt: new Date().toISOString(),
      };

      callbacks.onTurnComplete(errorMessage);
    }
  }

  workingSession = {
    ...workingSession,
    phase: "user-turn",
    updatedAt: new Date().toISOString(),
  };

  callbacks.onBatchComplete(workingSession);
  return workingSession;
}

// --- Judge phase ---

export interface JudgeCallbacks {
  onChunk: (content: string) => void;
  onComplete: (solutions: JudgeSolution[]) => void;
}

function parseSolutions(raw: string): JudgeSolution[] {
  const solutions: JudgeSolution[] = [];
  const lines = raw.split("\n");

  for (const line of lines) {
    const match = line.match(/^\s*([A-Z])\s*[:.]\s*(.+)/);
    if (match) {
      solutions.push({
        id: createId(),
        label: match[1],
        description: match[2].trim(),
      });
    }
  }

  return solutions;
}

export async function executeJudgePhase(
  session: DeliberationSession,
  callbacks: JudgeCallbacks,
  signal?: AbortSignal
): Promise<DeliberationSession> {
  let workingSession = { ...session, phase: "judging" as DeliberationPhase };

  const judgeModelId = workingSession.settings.judgeModelId;
  const judgeModel = getModelById(judgeModelId);
  if (!judgeModel) {
    throw new Error("Judge model is invalid.");
  }

  const archetypeSnippet = getJudgeArchetypeSnippet(workingSession);
  const prompt = buildJudgeSolutionPrompt(workingSession, archetypeSnippet);
  const inputMessages: ChatMessage[] = [
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user },
  ];

  const judgeMessage: DeliberationMessage = {
    id: createId(),
    role: "judge",
    modelId: judgeModel.id,
    modelName: judgeModel.name,
    color: judgeModel.color,
    content: "",
    timestamp: new Date().toISOString(),
    status: "streaming",
  };

  workingSession = {
    ...workingSession,
    messages: [...workingSession.messages, judgeMessage],
    updatedAt: new Date().toISOString(),
  };

  const effort = workingSession.settings.judgeReasoningEffort;
  const started = Date.now();

  try {
    const fullContent = await callModelStreaming(
      judgeModelId,
      inputMessages,
      {
        onChunk: (chunk) => callbacks.onChunk(chunk),
        onComplete: () => {
          // Handled after callModelStreaming returns
        },
      },
      effort,
      signal
    );

    const latencyMs = Date.now() - started;
    const solutions = parseSolutions(fullContent);

    const completedJudge: DeliberationMessage = {
      ...judgeMessage,
      content: fullContent,
      latencyMs,
      status: "complete",
    };

    workingSession = {
      ...workingSession,
      messages: workingSession.messages.map((m) =>
        m.id === judgeMessage.id ? completedJudge : m
      ),
      judgeSolutions: solutions,
      judgeRawResponse: fullContent,
      phase: "voting",
      updatedAt: new Date().toISOString(),
    };

    callbacks.onComplete(solutions);
    return workingSession;
  } catch (error) {
    const latencyMs = Date.now() - started;
    const errorJudge: DeliberationMessage = {
      ...judgeMessage,
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
      latencyMs,
    };

    workingSession = {
      ...workingSession,
      messages: workingSession.messages.map((m) =>
        m.id === judgeMessage.id ? errorJudge : m
      ),
      updatedAt: new Date().toISOString(),
    };

    throw error;
  }
}

// --- Voting phase ---

export interface VotingCallbacks {
  onVoteComplete: (vote: ModelVote) => void;
}

function parseVoteResponse(raw: string, modelId: string): { choice: string; reasoning: string } {
  // Try to extract JSON from the response
  const jsonMatch = raw.match(/\{[\s\S]*"choice"\s*:\s*"([A-Z])"[\s\S]*"reasoning"\s*:\s*"([\s\S]*?)"[\s\S]*\}/);
  if (jsonMatch) {
    return { choice: jsonMatch[1], reasoning: jsonMatch[2] };
  }

  // Try parsing the whole thing as JSON
  try {
    const parsed = JSON.parse(raw) as { choice?: string; reasoning?: string };
    if (parsed.choice && parsed.reasoning) {
      return { choice: parsed.choice, reasoning: parsed.reasoning };
    }
  } catch {
    // Not valid JSON
  }

  // Fallback: look for a letter choice in the text
  const letterMatch = raw.match(/\b([A-Z])\b/);
  return {
    choice: letterMatch?.[1] ?? "A",
    reasoning: raw,
  };
}

export async function executeVoting(
  session: DeliberationSession,
  callbacks: VotingCallbacks,
  signal?: AbortSignal
): Promise<DeliberationSession> {
  let workingSession = { ...session, phase: "voting" as DeliberationPhase };
  const solutions = workingSession.judgeSolutions;

  if (!solutions || solutions.length === 0) {
    throw new Error("No solutions available for voting.");
  }

  const modelIds = workingSession.settings.selectedModelIds;
  const models = getModelsByIds(modelIds);

  const votePromises = models.map(async (model) => {
    const archetypeSnippet = getArchetypeSnippet(workingSession, model.id);
    const prompt = buildVotePrompt(workingSession, model.id, solutions, archetypeSnippet);
    const inputMessages: ChatMessage[] = [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ];

    const effort = workingSession.settings.reasoningEffortMap?.[model.id];
    const started = Date.now();

    try {
      let fullContent = "";
      await callModelStreaming(
        model.id,
        inputMessages,
        {
          onChunk: (chunk) => {
            fullContent += chunk;
          },
          onComplete: () => {
            // Handled after return
          },
        },
        effort,
        signal
      );

      // Use fullContent from the return value in case onChunk wasn't called (non-streaming path)
      const latencyMs = Date.now() - started;
      const parsed = parseVoteResponse(fullContent, model.id);
      const matchedSolution = solutions.find((s) => s.label === parsed.choice);

      const vote: ModelVote = {
        modelId: model.id,
        modelName: model.name,
        color: model.color,
        chosenSolutionId: matchedSolution?.id ?? solutions[0].id,
        reasoning: parsed.reasoning,
        latencyMs,
      };

      callbacks.onVoteComplete(vote);
      return vote;
    } catch {
      // On error, default vote to first solution
      const vote: ModelVote = {
        modelId: model.id,
        modelName: model.name,
        color: model.color,
        chosenSolutionId: solutions[0].id,
        reasoning: "Voting failed — defaulted to first option.",
        latencyMs: Date.now() - started,
      };

      callbacks.onVoteComplete(vote);
      return vote;
    }
  });

  const votes = await Promise.all(votePromises);

  workingSession = {
    ...workingSession,
    votes,
    phase: "complete",
    updatedAt: new Date().toISOString(),
  };

  return workingSession;
}
