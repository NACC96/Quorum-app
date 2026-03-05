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
}

export interface Session {
  id: string;
  title?: string;
  question: string;
  context: string;
  settings: SessionSettings;
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
  judgeModelId: string;
  judgeReasoningEffort: ReasoningEffort;
  deliberationRounds: number;
  summaryEnabled: boolean;
  summaryModelId: string;
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
