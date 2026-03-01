import { ModelOption } from "@/lib/types";

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "anthropic/claude-3.7-sonnet",
    name: "Claude 3.7 Sonnet",
    provider: "Anthropic",
    color: "#8B5CF6",
    description: "Strong reasoning, nuanced analysis"
  },
  {
    id: "openai/gpt-4.1",
    name: "GPT-4.1",
    provider: "OpenAI",
    color: "#06B6D4",
    description: "Balanced depth and speed"
  },
  {
    id: "openai/o3-mini",
    name: "o3-mini",
    provider: "OpenAI",
    color: "#22D3EE",
    description: "Fast analytical reasoning"
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "Google",
    color: "#10B981",
    description: "Structured synthesis and planning"
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    provider: "Meta",
    color: "#A78BFA",
    description: "Wide-context open model"
  },
  {
    id: "mistralai/mistral-large",
    name: "Mistral Large",
    provider: "Mistral",
    color: "#14B8A6",
    description: "Clear strategic recommendations"
  },
  {
    id: "deepseek/deepseek-chat-v3-0324",
    name: "DeepSeek Chat V3",
    provider: "DeepSeek",
    color: "#34D399",
    description: "High-value depth for cost"
  },
  {
    id: "qwen/qwen-2.5-72b-instruct",
    name: "Qwen 2.5 72B",
    provider: "Qwen",
    color: "#67E8F9",
    description: "Strong multilingual logical coverage"
  }
];

export const DEFAULT_COUNCIL = [
  "anthropic/claude-3.7-sonnet",
  "openai/gpt-4.1",
  "google/gemini-2.5-pro"
];

export const DEFAULT_JUDGE = "anthropic/claude-3.7-sonnet";

export const MIN_COUNCIL_SIZE = 2;
export const MAX_DELIBERATION_ROUNDS = 3;

export function getModelById(id: string): ModelOption | undefined {
  return MODEL_OPTIONS.find((model) => model.id === id);
}

export function getModelsByIds(ids: string[]): ModelOption[] {
  return ids
    .map((id) => getModelById(id))
    .filter((model): model is ModelOption => Boolean(model));
}
