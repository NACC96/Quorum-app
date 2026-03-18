import { ModelOption, ReasoningEffort } from "@/lib/types";

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "openai/gpt-5.3-codex",
    name: "GPT-5.3 Codex",
    provider: "OpenAI",
    color: "#06B6D4",
    description: "Advanced code generation and reasoning"
  },
  {
    id: "openai/gpt-5.2",
    name: "GPT-5.2",
    provider: "OpenAI",
    color: "#0EA5E9",
    description: "Strong general-purpose reasoning and coding"
  },
  {
    id: "openai/gpt-5.3-chat",
    name: "GPT-5.3 Chat",
    provider: "OpenAI",
    color: "#0284C7",
    description: "High-quality conversational reasoning and synthesis"
  },
  {
    id: "openai/gpt-5.4",
    name: "GPT-5.4",
    provider: "OpenAI",
    color: "#2563EB",
    description: "Frontier general-purpose reasoning, coding, and synthesis"
  },
  {
    id: "inception/mercury-2",
    name: "Mercury 2",
    provider: "Inception",
    color: "#EC4899",
    description: "Fast multi-step reasoning with balanced cost"
  },
  {
    id: "google/gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    provider: "Google",
    color: "#10B981",
    description: "Structured synthesis and planning"
  },
  {
    id: "google/gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash Lite Preview",
    provider: "Google",
    color: "#22C55E",
    description: "Low-latency lightweight reasoning"
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    provider: "Anthropic",
    color: "#8B5CF6",
    description: "Strong reasoning, nuanced analysis"
  },
  {
    id: "qwen/qwen3.5-plus-02-15",
    name: "Qwen 3.5 Plus",
    provider: "Qwen",
    color: "#67E8F9",
    description: "Strong multilingual logical coverage"
  },
  {
    id: "minimax/minimax-m2.5",
    name: "MiniMax M2.5",
    provider: "MiniMax",
    color: "#F59E0B",
    description: "Efficient balanced reasoning"
  },
  {
    id: "z-ai/glm-5",
    name: "GLM-5",
    provider: "Z-AI",
    color: "#14B8A6",
    description: "Clear strategic recommendations"
  },
  {
    id: "qwen/qwen3-max-thinking",
    name: "Qwen 3 Max Thinking",
    provider: "Qwen",
    color: "#22D3EE",
    description: "Deep chain-of-thought reasoning"
  },
  {
    id: "anthropic/claude-opus-4.6",
    name: "Claude Opus 4.6",
    provider: "Anthropic",
    color: "#A78BFA",
    description: "Advanced reasoning and creative depth"
  },
  {
    id: "qwen/qwen3-coder-next",
    name: "Qwen 3 Coder Next",
    provider: "Qwen",
    color: "#34D399",
    description: "Specialized code generation"
  },
  {
    id: "moonshotai/kimi-k2.5",
    name: "Kimi K2.5",
    provider: "Moonshot AI",
    color: "#FB923C",
    description: "High-value depth for cost"
  },
  {
    id: "bytedance-seed/seed-2.0-mini",
    name: "Seed 2.0 Mini",
    provider: "ByteDance Seed",
    color: "#F97316",
    description: "Compact, cost-efficient reasoning"
  },
  {
    id: "aion-labs/aion-2.0",
    name: "Aion 2.0",
    provider: "Aion Labs",
    color: "#A855F7",
    description: "Deliberative analysis and synthesis"
  },
  {
    id: "google/gemini-3-flash-preview",
    name: "Gemini 3 Flash Preview",
    provider: "Google",
    color: "#4ADE80",
    description: "Fast analytical reasoning"
  },
  {
    id: "nous/Hermes-4-405B",
    name: "Hermes 4 405B",
    provider: "Nous Research",
    color: "#F59E0B",
    description: "Advanced reasoning and creative depth (Llama 3.1 405B)"
  }
];

export const DEFAULT_COUNCIL = [
  "anthropic/claude-sonnet-4.6",
  "openai/gpt-5.3-codex",
  "google/gemini-3.1-pro-preview"
];

export const DEFAULT_JUDGE = "anthropic/claude-sonnet-4.6";
export const DEFAULT_SUMMARY_MODEL = DEFAULT_JUDGE;

export const REASONING_EFFORT_OPTIONS: { label: string; value: ReasoningEffort }[] = [
  { label: "None", value: "none" },
  { label: "Minimal", value: "minimal" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "X-High", value: "xhigh" }
];

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "high";

export const MIN_COUNCIL_SIZE = 2;
export const MAX_COUNCIL_SIZE = 8;
export const MAX_DELIBERATION_ROUNDS = 3;

export function getModelById(id: string): ModelOption | undefined {
  return MODEL_OPTIONS.find((model) => model.id === id);
}

export function getModelsByIds(ids: string[]): ModelOption[] {
  return ids
    .map((id) => getModelById(id))
    .filter((model): model is ModelOption => Boolean(model));
}
