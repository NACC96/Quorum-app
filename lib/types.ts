export type RoundType = "independent" | "summary" | "deliberation" | "judgment";
export type SessionStatus = "draft" | "running" | "complete" | "error";
export type RoundStatus = "pending" | "running" | "complete" | "error";
export type ResponseStatus = "pending" | "complete" | "error";
export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type CostSource = "provider" | "calculated" | "unavailable";
export type SummarySourceRoundType = "independent" | "deliberation";

export interface UsageMetrics {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens: number;
  costUsd?: number;
  costSource?: CostSource;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  color: string;
  description: string;
}

export interface ModelInputMessage {
  role: "system" | "user";
  content: string;
}

export interface ModelResponse {
  id: string;
  modelId: string;
  modelName: string;
  provider: string;
  color: string;
  content: string;
  tokenCount: number;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  costSource?: CostSource;
  latencyMs: number;
  status: ResponseStatus;
  error?: string;
  errorReason?: string;
  errorRequestId?: string;
  inputMessages?: ModelInputMessage[];
}

export interface Round {
  id: string;
  roundNumber: number;
  type: RoundType;
  status: RoundStatus;
  responses: ModelResponse[];
  deliberationIndex?: number;
  summarySourceRoundId?: string;
  summarySourceRoundType?: SummarySourceRoundType;
  summarySourceDeliberationIndex?: number;
  startedAt: string;
  completedAt?: string;
}

export interface SessionSettings {
  selectedModelIds: string[];
  judgeModelId: string;
  deliberationRounds: number;
  summaryEnabled: boolean;
  summaryModelId?: string;
  reasoningEffortMap?: Record<string, ReasoningEffort>;
  judgeReasoningEffort?: ReasoningEffort;
  summaryReasoningEffort?: ReasoningEffort;
  archetypeMap?: Record<number, string>;
  judgeArchetypeId?: string;
}

export interface Session {
  id: string;
  title?: string;
  question: string;
  context: string;
  settings: SessionSettings;
  aliasMap?: Record<string, string>;
  status: SessionStatus;
  rounds: Round[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  content: string;
  tokenCount: number;
  usage: UsageMetrics;
}

export interface DraftState {
  question: string;
  context: string;
  councilSize: number;
  councilSlots: (string | null)[];
  councilReasoningEfforts: Record<number, ReasoningEffort>;
  councilArchetypeMap: Record<number, string | null>;
  councilAliasMap: Record<number, string>;
  judgeModelId: string;
  judgeReasoningEffort: ReasoningEffort;
  judgeArchetypeId: string | null;
  deliberationRounds: number;
  summaryEnabled: boolean;
  summaryModelId: string;
  summaryReasoningEffort: ReasoningEffort;
}

export interface RoundOutcome {
  modelId: string;
  status: "complete" | "error";
  content?: string;
  tokenCount?: number;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  costSource?: CostSource;
  latencyMs: number;
  error?: string;
  errorReason?: string;
  errorRequestId?: string;
  inputMessages?: ModelInputMessage[];
}

// --- Deliberation Mode types ---

export type DeliberationPhase = "deliberating" | "user-turn" | "judging" | "voting" | "complete";

export interface DeliberationMessage {
  id: string;
  role: "model" | "user" | "judge" | "system";
  modelId?: string;
  modelName?: string;
  color?: string;
  content: string;
  tokenCount?: number;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  costSource?: CostSource;
  latencyMs?: number;
  timestamp: string;
  status: "pending" | "streaming" | "complete" | "error";
  error?: string;
}

export interface JudgeSolution {
  id: string;
  label: string;
  description: string;
}

export interface ModelVote {
  modelId: string;
  modelName: string;
  color: string;
  chosenSolutionId: string;
  reasoning: string;
  tokenCount?: number;
  costUsd?: number;
  costSource?: CostSource;
  latencyMs?: number;
}

export interface DeliberationSettings {
  selectedModelIds: string[];
  judgeModelId: string;
  turnsPerBatch: number;
  archetypeMap?: Record<number, string>;
  judgeArchetypeId?: string;
  reasoningEffortMap?: Record<string, ReasoningEffort>;
  judgeReasoningEffort?: ReasoningEffort;
}

export interface DeliberationSession {
  id: string;
  title?: string;
  question: string;
  context: string;
  settings: DeliberationSettings;
  aliasMap?: Record<string, string>;
  messages: DeliberationMessage[];
  phase: DeliberationPhase;
  currentTurn: number;
  totalTurnsInBatch: number;
  judgeSolutions?: JudgeSolution[];
  judgeRawResponse?: string;
  votes?: ModelVote[];
  createdAt: string;
  updatedAt: string;
}
