import { ModelOption, Round } from "@/lib/types";

function renderContext(context: string): string {
  return context.trim() ? context.trim() : "No extra context provided.";
}

function getRoundTitle(round: Round): string {
  if (round.type === "independent") {
    return "Independent Round";
  }

  if (round.type === "summary") {
    if (round.summarySourceRoundType === "deliberation") {
      return `Summary after Deliberation ${round.summarySourceDeliberationIndex ?? "?"}`;
    }

    return "Summary after Independent";
  }

  if (round.type === "judgment") {
    return "Judgment";
  }

  return `Deliberation Round ${round.deliberationIndex ?? round.roundNumber - 1}`;
}

function renderRoundTranscript(round: Round): string {
  const roundTitle = getRoundTitle(round);

  if (round.type === "summary") {
    const summaryResponse = round.responses[0];
    if (!summaryResponse) {
      return `${roundTitle}\nNo summary response was available.`;
    }

    if (summaryResponse.status === "error") {
      return `${roundTitle}\n- ${summaryResponse.modelName} (${summaryResponse.provider}): ERROR -> ${
        summaryResponse.error ?? "Unknown error"
      }`;
    }

    return `${roundTitle}\n${summaryResponse.content}`;
  }

  const items = round.responses
    .map((response) => {
      if (response.status === "error") {
        return `- ${response.modelName} (${response.provider}): ERROR -> ${response.error ?? "Unknown error"}`;
      }

      return `- ${response.modelName} (${response.provider}):\n${response.content}`;
    })
    .join("\n\n");

  return `${roundTitle}\n${items}`;
}

function renderRoundResponsesForSummary(round: Round): string {
  return round.responses
    .map((response) => {
      if (response.status === "error") {
        return [
          `## ${response.modelName} (${response.provider})`,
          "Response status: unavailable",
          `Error: ${response.error ?? "Unknown error"}`
        ].join("\n");
      }

      return [
        `## ${response.modelName} (${response.provider})`,
        "Response status: complete",
        response.content
      ].join("\n\n");
    })
    .join("\n\n");
}

function renderOtherResponses(round: Round, currentModelId: string): string {
  const others = round.responses.filter(
    (response) => response.modelId !== currentModelId && response.status === "complete"
  );

  if (others.length === 0) {
    return "No peer responses were available from the previous round.";
  }

  return others
    .map(
      (response) =>
        `### ${response.modelName} (${response.provider})\n${response.content}`
    )
    .join("\n\n");
}

function renderPriorRoundInput(round: Round, currentModelId: string): {
  label: string;
  content: string;
} {
  if (round.type === "summary") {
    const summaryResponse = round.responses[0];
    if (!summaryResponse || summaryResponse.status !== "complete") {
      return {
        label: "Previous round summary:",
        content: "No previous summary was available from the previous round."
      };
    }

    return {
      label: "Previous round summary:",
      content: summaryResponse.content
    };
  }

  return {
    label: "Peer responses from previous round:",
    content: renderOtherResponses(round, currentModelId)
  };
}

export function buildIndependentPrompt(
  question: string,
  context: string,
  participant: ModelOption
): { system: string; user: string } {
  return {
    system: [
      "You are a council participant in Quorum.",
      "Give a rigorous independent answer.",
      "Do not reference other participants because you have not seen them yet.",
      "Use clear sections: Thesis, Key Arguments, Recommendation, Risks."
    ].join(" "),
    user: [
      `Question:\n${question.trim()}`,
      `Context:\n${renderContext(context)}`,
      `Participant identity: ${participant.name} (${participant.provider})`
    ].join("\n\n")
  };
}

export function buildDeliberationPrompt(
  question: string,
  context: string,
  participant: ModelOption,
  priorRound: Round,
  deliberationIndex: number
): { system: string; user: string } {
  const priorRoundInput = renderPriorRoundInput(priorRound, participant.id);

  return {
    system: [
      "You are a council participant in a structured AI deliberation.",
      "Critically evaluate peer reasoning, then refine your position.",
      "Be explicit about agreements, disagreements, and updates to your recommendation.",
      "Use sections: Agreements, Challenges, Updated Recommendation, Confidence (0-100)."
    ].join(" "),
    user: [
      `Question:\n${question.trim()}`,
      `Context:\n${renderContext(context)}`,
      `Current model: ${participant.name} (${participant.provider})`,
      `This is deliberation round ${deliberationIndex}.`,
      priorRoundInput.label,
      priorRoundInput.content
    ].join("\n\n")
  };
}

export function buildSummaryPrompt(
  question: string,
  context: string,
  sourceRound: Round
): { system: string; user: string } {
  return {
    system: [
      "You are the summarizer model in Quorum.",
      "Summarize each participant response from the provided round into a detailed, faithful markdown digest.",
      "For every source model, output exactly one `## Model Name (Provider)` section.",
      "Inside each model section include `### Thesis`, `### Key Arguments`, `### Recommendation`, and `### Risks / Blind Spots`.",
      "Target roughly 150-250 words total per source model.",
      "If a source response failed or is unavailable, explicitly say the response was unavailable and do not invent content.",
      "Return markdown only."
    ].join(" "),
    user: [
      `Question:\n${question.trim()}`,
      `Context:\n${renderContext(context)}`,
      `Round to summarize:\n${getRoundTitle(sourceRound)}`,
      "Source responses:",
      renderRoundResponsesForSummary(sourceRound)
    ].join("\n\n")
  };
}

export function buildJudgmentPrompt(
  question: string,
  context: string,
  judge: ModelOption,
  rounds: Round[]
): { system: string; user: string } {
  const transcript = rounds.map((round) => renderRoundTranscript(round)).join("\n\n---\n\n");

  return {
    system: [
      "You are the judge model in Quorum.",
      "Synthesize all arguments into a final verdict.",
      "Be neutral, evidence-driven, and explicit about uncertainty.",
      "Use sections: Final Verdict, Consensus, Key Disagreements, Best Arguments, Blind Spots, Action Plan."
    ].join(" "),
    user: [
      `Question:\n${question.trim()}`,
      `Context:\n${renderContext(context)}`,
      `Judge identity: ${judge.name} (${judge.provider})`,
      "Council transcript:",
      transcript
    ].join("\n\n")
  };
}
