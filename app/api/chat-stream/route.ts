import { NextRequest } from "next/server";
import type { ChatMessage, CostSource } from "@/lib/types";
import { getModelTokenRates } from "@/lib/pricing";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CompletionUsage {
  prompt_tokens?: number | string;
  completion_tokens?: number | string;
  input_tokens?: number | string;
  output_tokens?: number | string;
  total_tokens?: number | string;
  cost?: number | string;
  total_cost?: number | string;
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

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PROVIDER_TIMEOUT_MS = 10 * 60 * 1000;
const PROVIDER_TIMEOUT_REASON =
  "Timed out after 10 minutes waiting for model provider response.";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

/* ------------------------------------------------------------------ */
/*  Helpers (mirrored from /api/chat)                                  */
/* ------------------------------------------------------------------ */

function isNousModel(model: string): boolean {
  return model.startsWith("nous/");
}

function getNousModelId(model: string): string {
  return model.replace("nous/", "");
}

function createProviderAbortHandle(
  clientSignal?: AbortSignal
): ProviderAbortHandle {
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
    },
  };
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toNonNegativeTokenCount(value: unknown): number | undefined {
  const parsed = toFiniteNumber(value);
  if (parsed === undefined || parsed < 0) return undefined;
  return Math.floor(parsed);
}

function resolveTotalTokens(
  reportedTotal: number | undefined,
  promptTokens: number | undefined,
  completionTokens: number | undefined
): number {
  if (reportedTotal !== undefined) return reportedTotal;
  if (promptTokens !== undefined && completionTokens !== undefined)
    return promptTokens + completionTokens;
  return 0;
}

function parseProviderCost(
  usage: CompletionUsage | undefined
): number | undefined {
  const directCost = toFiniteNumber(usage?.cost);
  if (directCost !== undefined) return directCost;
  return toFiniteNumber(usage?.total_cost);
}

async function normalizeUsage(
  model: string,
  usage: CompletionUsage | undefined
): Promise<NormalizedUsage> {
  const promptTokens = toNonNegativeTokenCount(
    usage?.prompt_tokens ?? usage?.input_tokens
  );
  const completionTokens = toNonNegativeTokenCount(
    usage?.completion_tokens ?? usage?.output_tokens
  );
  const reportedTotal = toNonNegativeTokenCount(usage?.total_tokens);
  const totalTokens = resolveTotalTokens(
    reportedTotal,
    promptTokens,
    completionTokens
  );

  const providerCost = parseProviderCost(usage);
  if (providerCost !== undefined) {
    return {
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd: providerCost,
      costSource: "provider",
    };
  }

  if (promptTokens !== undefined && completionTokens !== undefined) {
    const rates = await getModelTokenRates(model);
    if (rates) {
      return {
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd:
          promptTokens * rates.promptUsdPerToken +
          completionTokens * rates.completionUsdPerToken,
        costSource: "calculated",
      };
    }
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    costSource: "unavailable",
  };
}

/* ------------------------------------------------------------------ */
/*  SSE helpers                                                        */
/* ------------------------------------------------------------------ */

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function sseErrorResponse(message: string, reason?: string): Response {
  const body = sseEvent({ error: message, reason });
  return new Response(body, { headers: SSE_HEADERS });
}

/* ------------------------------------------------------------------ */
/*  Provider SSE stream parser                                         */
/* ------------------------------------------------------------------ */

/**
 * Reads an OpenAI-compatible SSE stream from the provider, extracts
 * delta content tokens, and writes them to our client-facing stream.
 * Accumulates and returns the usage data from the final chunk.
 */
async function pipeProviderStream(
  providerResponse: Response,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder
): Promise<CompletionUsage | undefined> {
  const reader = providerResponse.body?.getReader();
  if (!reader) {
    await writer.write(
      encoder.encode(sseEvent({ error: "No response body from provider." }))
    );
    await writer.close();
    return undefined;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let usage: CompletionUsage | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last partial line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);

        if (payload === "[DONE]") continue;

        try {
          const chunk = JSON.parse(payload) as {
            choices?: Array<{
              delta?: { content?: string; reasoning_content?: string };
            }>;
            usage?: CompletionUsage;
          };

          // Capture usage from any chunk that provides it
          if (chunk.usage) {
            usage = chunk.usage;
          }

          const delta = chunk.choices?.[0]?.delta;
          const content = delta?.content ?? delta?.reasoning_content;
          if (content) {
            await writer.write(encoder.encode(sseEvent({ content })));
          }
        } catch {
          // Skip unparseable chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return usage;
}

/* ------------------------------------------------------------------ */
/*  Provider callers (streaming)                                       */
/* ------------------------------------------------------------------ */

function buildProviderPayload(
  model: string,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number,
  reasoningEffort?: string,
  isNous?: boolean
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: isNous ? getNousModelId(model) : model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  };

  if (reasoningEffort && reasoningEffort !== "none") {
    payload.reasoning = { effort: reasoningEffort };
  }

  return payload;
}

async function fetchProviderStream(
  url: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>,
  abortHandle: ProviderAbortHandle
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: abortHandle.signal,
  });
}

/* ------------------------------------------------------------------ */
/*  Main handler                                                       */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return sseErrorResponse("Invalid JSON payload.");
  }

  if (!body.model || typeof body.model !== "string") {
    return sseErrorResponse("Invalid payload. 'model' must be a non-empty string.");
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return sseErrorResponse("Invalid payload. 'messages' must be a non-empty array.");
  }

  const model = body.model;
  const temperature = body.temperature ?? 0.7;
  const maxTokens = body.maxTokens ?? 65536;
  const reasoningEffort = body.reasoningEffort;

  const nous = isNousModel(model);
  const apiKey = nous
    ? process.env.NOUS_API_KEY
    : process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    const keyName = nous ? "NOUS_API_KEY" : "OPENROUTER_API_KEY";
    return sseErrorResponse(`${keyName} is not configured on the server.`);
  }

  const providerUrl = nous
    ? "https://inference-api.nousresearch.com/v1/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions";

  const providerHeaders: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };

  if (!nous) {
    providerHeaders["HTTP-Referer"] =
      process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000";
    providerHeaders["X-Title"] =
      process.env.OPENROUTER_APP_NAME ?? "Quorum";
  }

  const payload = buildProviderPayload(
    model,
    body.messages,
    temperature,
    maxTokens,
    reasoningEffort,
    nous
  );

  const abortHandle = createProviderAbortHandle(request.signal);

  let providerResponse: Response;
  try {
    providerResponse = await fetchProviderStream(
      providerUrl,
      providerHeaders,
      payload,
      abortHandle
    );
  } catch (error) {
    abortHandle.cleanup();
    if (abortHandle.didTimeout()) {
      const label = nous ? "Nous API" : "OpenRouter";
      return sseErrorResponse(
        `${label} request timed out after 10 minutes.`,
        PROVIDER_TIMEOUT_REASON
      );
    }
    const msg =
      error instanceof Error ? error.message : "Failed to reach model provider.";
    return sseErrorResponse(
      `Provider request failed: ${msg}`,
      "Could not connect to model provider."
    );
  }

  if (!providerResponse.ok) {
    abortHandle.cleanup();
    let errorMsg = `Provider returned HTTP ${providerResponse.status}.`;
    try {
      const errBody = (await providerResponse.json()) as {
        error?: { message?: string };
      };
      if (errBody.error?.message) {
        errorMsg = errBody.error.message;
      }
    } catch {
      // Use default error message
    }
    return sseErrorResponse(errorMsg, `Provider returned HTTP ${providerResponse.status}.`);
  }

  // Set up client-facing SSE stream
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  // Process in background — the Response streams as we write
  const streamPromise = (async () => {
    try {
      const usage = await pipeProviderStream(
        providerResponse,
        writer,
        encoder
      );

      const normalized = await normalizeUsage(model, usage);
      await writer.write(
        encoder.encode(
          sseEvent({
            done: true,
            usage: normalized,
          })
        )
      );
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Stream processing failed.";
      try {
        await writer.write(
          encoder.encode(sseEvent({ error: msg, reason: "Stream interrupted." }))
        );
      } catch {
        // Writer may already be closed
      }
    } finally {
      abortHandle.cleanup();
      try {
        await writer.close();
      } catch {
        // Already closed
      }
    }
  })();

  // Ensure we don't have unhandled promise rejections
  streamPromise.catch(() => {});

  return new Response(readable, { headers: SSE_HEADERS });
}
