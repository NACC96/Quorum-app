export type RoundType = "independent" | "deliberation" | "judgment";
export type SessionStatus = "draft" | "running" | "complete" | "error";
export type RoundStatus = "pending" | "running" | "complete" | "error";
export type ResponseStatus = "pending" | "complete" | "error";

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  color: string;
  description: string;
}

export interface ModelResponse {
  id: string;
  modelId: string;
  modelName: string;
  provider: string;
  color: string;
  content: string;
  tokenCount: number;
  latencyMs: number;
  status: ResponseStatus;
  error?: string;
}

export interface Round {
  id: string;
  roundNumber: number;
  type: RoundType;
  status: RoundStatus;
  responses: ModelResponse[];
  startedAt: string;
  completedAt?: string;
}

export interface SessionSettings {
  selectedModelIds: string[];
  judgeModelId: string;
  deliberationRounds: number;
}

export interface Session {
  id: string;
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
}
