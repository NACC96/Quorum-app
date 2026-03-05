const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const PRICING_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const HERMES_MODEL_ID = "nous/hermes-4-405b";

export interface TokenRates {
  promptUsdPerToken: number;
  completionUsdPerToken: number;
}

interface OpenRouterModelPricing {
  prompt?: number | string;
  completion?: number | string;
}

interface OpenRouterModel {
  id?: string;
  pricing?: OpenRouterModelPricing;
}

interface OpenRouterModelsResponse {
  data?: OpenRouterModel[];
}

let pricingCache: { expiresAt: number; ratesByModel: Map<string, TokenRates> } | null = null;
let pricingCacheRefreshPromise: Promise<Map<string, TokenRates>> | null = null;

function normalizeModelId(modelId: string): string {
  return modelId.trim().toLowerCase();
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

function parseTokenRates(pricing: OpenRouterModelPricing | undefined): TokenRates | null {
  if (!pricing) return null;

  const promptUsdPerToken = toFiniteNumber(pricing.prompt);
  const completionUsdPerToken = toFiniteNumber(pricing.completion);

  if (promptUsdPerToken === undefined || completionUsdPerToken === undefined) {
    return null;
  }

  return { promptUsdPerToken, completionUsdPerToken };
}

function getHermesOverrideRates(): TokenRates {
  return {
    promptUsdPerToken: 0.09 / 1_000_000,
    completionUsdPerToken: 0.37 / 1_000_000
  };
}

async function fetchOpenRouterRates(): Promise<Map<string, TokenRates>> {
  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    throw new Error(`OpenRouter models request failed with status ${response.status}`);
  }

  const json = (await response.json()) as OpenRouterModelsResponse;
  const ratesByModel = new Map<string, TokenRates>();

  for (const model of json.data ?? []) {
    if (!model.id) continue;

    const rates = parseTokenRates(model.pricing);
    if (!rates) continue;

    ratesByModel.set(normalizeModelId(model.id), rates);
  }

  return ratesByModel;
}

async function getOpenRouterRates(): Promise<Map<string, TokenRates>> {
  const now = Date.now();
  if (pricingCache && pricingCache.expiresAt > now) {
    return pricingCache.ratesByModel;
  }

  if (!pricingCacheRefreshPromise) {
    pricingCacheRefreshPromise = fetchOpenRouterRates()
      .then((ratesByModel) => {
        pricingCache = {
          expiresAt: Date.now() + PRICING_CACHE_TTL_MS,
          ratesByModel
        };
        return ratesByModel;
      })
      .finally(() => {
        pricingCacheRefreshPromise = null;
      });
  }

  return pricingCacheRefreshPromise;
}

export async function getModelTokenRates(modelId: string): Promise<TokenRates | null> {
  const normalizedModelId = normalizeModelId(modelId);

  if (normalizedModelId === HERMES_MODEL_ID) {
    return getHermesOverrideRates();
  }

  try {
    const ratesByModel = await getOpenRouterRates();
    return ratesByModel.get(normalizedModelId) ?? null;
  } catch {
    return null;
  }
}
