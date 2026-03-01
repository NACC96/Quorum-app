import { ModelOption, Round } from "@/lib/types";

function renderContext(context: string): string {
  return context.trim() ? context.trim() : "No extra context provided.";
}

function renderRoundTranscript(round: Round): string {
  const roundTitle =
    round.type === "independent"
      ? "Independent Round"
      : round.type === "judgment"
        ? "Judgment"
        : `Deliberation Round ${round.roundNumber - 1}`;

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
      "Peer responses from previous round:",
      renderOtherResponses(priorRound, participant.id)
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
