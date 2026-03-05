import { NextRequest, NextResponse } from "next/server";
import type { ChatMessage, CostSource } from "@/lib/types";
import { getModelTokenRates } from "@/lib/pricing";

interface CompletionChoice {
  message?: {
    content?: string;
    reasoning_content?: string;
  };
}

interface CompletionUsage {
  prompt_tokens?: number | string;
  completion_tokens?: number | string;
  input_tokens?: number | string;
  output_tokens?: number | string;
  total_tokens?: number | string;
  cost?: number | string;
  total_cost?: number | string;
}

interface CompletionResponse {
  choices?: CompletionChoice[];
  usage?: CompletionUsage;
  error?: {
    message?: string;
  };
}

interface RequestBody {
  model?: string;
  messages?: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: string;
}

interface NormalizedUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens: number;
  costUsd?: number;
  costSource: CostSource;
}

interface ProviderAbortHandle {
  signal: AbortSignal;
  didTimeout: () => boolean;
  cleanup: () => void;
}

const PROVIDER_TIMEOUT_MS = 10 * 60 * 1000;
const PROVIDER_TIMEOUT_REASON = "Timed out after 10 minutes waiting for model provider response.";

function createRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function inferTimeoutReason(message: string | undefined): string | undefined {
  if (!message) {
    return undefined;
  }

  const normalized = message.toLowerCase();
  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("deadline exceeded")
  ) {
    return PROVIDER_TIMEOUT_REASON;
  }

  return undefined;
}

function inferTimeoutReasonFromStatus(status: number): string | undefined {
  if ([408, 504, 522, 524, 598, 599].includes(status)) {
    return PROVIDER_TIMEOUT_REASON;
  }

  return undefined;
}

function createProviderAbortHandle(clientSignal?: AbortSignal): ProviderAbortHandle {
  const controller = new AbortController();
  let didTimeout = false;

  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, PROVIDER_TIMEOUT_MS);

  const onClientAbort = () => {
    controller.abort();
  };

  if (clientSignal) {
    if (clientSignal.aborted) {
      onClientAbort();
    } else {
      clientSignal.addEventListener("abort", onClientAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    didTimeout: () => didTimeout,
    cleanup: () => {
      clearTimeout(timeoutId);
      if (clientSignal) {
        clientSignal.removeEventListener("abort", onClientAbort);
      }
    }
  };
}

function classifyProviderFetchError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Failed to reach model provider.";
  }

  const timeoutReason = inferTimeoutReason(error.message);
  if (timeoutReason) {
    return timeoutReason;
  }

  const normalized = error.message.toLowerCase();
  if (
    normalized.includes("connect") ||
    normalized.includes("econn") ||
    normalized.includes("enotfound") ||
    normalized.includes("dns")
  ) {
    return "Could not connect to model provider.";
  }

  return "Failed to reach model provider.";
}

function errorResponse(status: number, message: string, requestId: string, reason?: string): NextResponse {
  return NextResponse.json(
    {
      error: message,
      reason,
      requestId
    },
    { status }
  );
}

function isNousModel(model: string): boolean {
  return model.startsWith("nous/");
}

function getNousModelId(model: string): string {
  return model.replace("nous/", "");
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function toNonNegativeTokenCount(value: unknown): number | undefined {
  const parsed = toFiniteNumber(value);
  if (parsed === undefined || parsed < 0) {
    return undefined;
  }

  return Math.floor(parsed);
}

function resolveTotalTokens(
  reportedTotal: number | undefined,
  promptTokens: number | undefined,
  completionTokens: number | undefined
): number {
  if (reportedTotal !== undefined) {
    return reportedTotal;
  }

  if (promptTokens !== undefined && completionTokens !== undefined) {
    return promptTokens + completionTokens;
  }

  return 0;
}

function parseProviderCost(usage: CompletionUsage | undefined): number | undefined {
  const directCost = toFiniteNumber(usage?.cost);
  if (directCost !== undefined) {
    return directCost;
  }

  return toFiniteNumber(usage?.total_cost);
}

async function normalizeUsage(model: string, usage: CompletionUsage | undefined): Promise<NormalizedUsage> {
  const promptTokens = toNonNegativeTokenCount(usage?.prompt_tokens ?? usage?.input_tokens);
  const completionTokens = toNonNegativeTokenCount(usage?.completion_tokens ?? usage?.output_tokens);
  const reportedTotal = toNonNegativeTokenCount(usage?.total_tokens);
  const totalTokens = resolveTotalTokens(reportedTotal, promptTokens, completionTokens);

  const providerCost = parseProviderCost(usage);
  if (providerCost !== undefined) {
    return {
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd: providerCost,
      costSource: "provider"
    };
  }

  if (promptTokens !== undefined && completionTokens !== undefined) {
    const rates = await getModelTokenRates(model);
    if (rates) {
      return {
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd: promptTokens * rates.promptUsdPerToken + completionTokens * rates.completionUsdPerToken,
        costSource: "calculated"
      };
    }
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    costSource: "unavailable"
  };
}

async function buildModelResponse(
  response: Response,
  model: string,
  providerLabel: "Nous API" | "OpenRouter",
  requestId: string
): Promise<NextResponse> {
  const json = (await response.json().catch(() => ({}))) as CompletionResponse;

  if (!response.ok) {
    const message =
      json.error?.message ?? `${providerLabel} request failed with status ${response.status}`;
    const reason =
      inferTimeoutReason(json.error?.message) ??
      inferTimeoutReasonFromStatus(response.status) ??
      `Provider returned HTTP ${response.status}.`;
    return errorResponse(response.status, message, requestId, reason);
  }

  const choice = json.choices?.[0]?.message;
  const content = (choice?.content ?? choice?.reasoning_content ?? "").trim();

  if (!content) {
    return errorResponse(
      502,
      "Model returned an empty response.",
      requestId,
      "Provider returned an empty completion payload."
    );
  }

  const usage = await normalizeUsage(model, json.usage);

  return NextResponse.json({
    content,
    tokenCount: usage.totalTokens,
    usage
  });
}

async function callNous(
  model: string,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number,
  requestId: string,
  reasoningEffort?: string,
  requestSignal?: AbortSignal
): Promise<NextResponse> {
  const apiKey = process.env.NOUS_API_KEY;

  if (!apiKey) {
    return errorResponse(500, "NOUS_API_KEY is not configured on the server.", requestId);
  }

  const payload: Record<string, unknown> = {
    model: getNousModelId(model),
    messages,
    temperature,
    max_tokens: maxTokens
  };

  if (reasoningEffort && reasoningEffort !== "none") {
    payload.reasoning = { effort: reasoningEffort };
  }

  const abortHandle = createProviderAbortHandle(requestSignal);
  let response: Response;
  try {
    response = await fetch("https://inference-api.nousresearch.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: abortHandle.signal
    });
  } catch (error) {
    if (abortHandle.didTimeout()) {
      const message = `Nous API request timed out after 10 minutes (${getNousModelId(model)}).`;
      return errorResponse(504, message, requestId, PROVIDER_TIMEOUT_REASON);
    }

    const reason = classifyProviderFetchError(error);
    const message = `Nous API request failed (${getNousModelId(model)}).`;
    return errorResponse(504, message, requestId, reason);
  } finally {
    abortHandle.cleanup();
  }

  return buildModelResponse(response, model, "Nous API", requestId);
}

async function callOpenRouter(
  model: string,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number,
  requestId: string,
  reasoningEffort?: string,
  requestSignal?: AbortSignal
): Promise<NextResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return errorResponse(500, "OPENROUTER_API_KEY is not configured on the server.", requestId);
  }

  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens
  };

  if (reasoningEffort && reasoningEffort !== "none") {
    payload.reasoning = { effort: reasoningEffort };
  }

  const abortHandle = createProviderAbortHandle(requestSignal);
  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_APP_NAME ?? "Quorum"
      },
      body: JSON.stringify(payload),
      signal: abortHandle.signal
    });
  } catch (error) {
    if (abortHandle.didTimeout()) {
      const message = `OpenRouter request timed out after 10 minutes (${model}).`;
      return errorResponse(504, message, requestId, PROVIDER_TIMEOUT_REASON);
    }

    const reason = classifyProviderFetchError(error);
    const message = `OpenRouter request failed (${model}).`;
    return errorResponse(504, message, requestId, reason);
  } finally {
    abortHandle.cleanup();
  }

  return buildModelResponse(response, model, "OpenRouter", requestId);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId();

  try {
    const body = (await request.json()) as RequestBody;

    if (!body.model || !Array.isArray(body.messages) || body.messages.length === 0) {
      return errorResponse(400, "Invalid payload. Expected model and non-empty messages.", requestId);
    }

    const temperature = body.temperature ?? 0.7;
    const maxTokens = body.maxTokens ?? 65536;
    const reasoningEffort = body.reasoningEffort;

    if (isNousModel(body.model)) {
      return await callNous(
        body.model,
        body.messages,
        temperature,
        maxTokens,
        requestId,
        reasoningEffort,
        request.signal
      );
    }

    return await callOpenRouter(
      body.model,
      body.messages,
      temperature,
      maxTokens,
      requestId,
      reasoningEffort,
      request.signal
    );
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Unknown server error";
    const message = raw === "fetch failed"
      ? "Request failed — the model provider may be down or unreachable."
      : raw;
    return errorResponse(500, message, requestId, "Unexpected server error.");
  }
}
