import { Round, Session } from "@/lib/types";
import { getModelById } from "@/lib/models";

export function formatRoundLabel(round: Round): string {
  if (round.type === "independent") {
    return "Independent";
  }

  if (round.type === "judgment") {
    return "Verdict";
  }

  return `Deliberation ${round.roundNumber - 1}`;
}

export function msToSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

export function modelShortName(modelId: string): string {
  const model = getModelById(modelId);
  return model ? model.name : modelId;
}

export function formatUsd(value: number): string {
  if (value > 0 && value < 0.0001) {
    return "<$0.0001";
  }

  return `$${value.toFixed(4)}`;
}

export function getSessionCostSummary(session: Session): {
  totalCostUsd: number;
  pricedCompleteCount: number;
  completeCount: number;
  isPartial: boolean;
} {
  let totalCostUsd = 0;
  let pricedCompleteCount = 0;
  let completeCount = 0;

  for (const round of session.rounds) {
    for (const response of round.responses) {
      if (response.status !== "complete") {
        continue;
      }

      completeCount += 1;

      if (typeof response.costUsd === "number" && Number.isFinite(response.costUsd)) {
        totalCostUsd += response.costUsd;
        pricedCompleteCount += 1;
      }
    }
  }

  return {
    totalCostUsd,
    pricedCompleteCount,
    completeCount,
    isPartial: pricedCompleteCount < completeCount
  };
}
