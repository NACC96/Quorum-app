import { DeliberationSession, JudgeSolution } from "@/lib/types";
import { getModelById } from "@/lib/models";

function renderContext(context: string): string {
  return context.trim() ? context.trim() : "No extra context provided.";
}

function getAlias(session: DeliberationSession, modelId: string): string {
  return session.aliasMap?.[modelId] ?? getModelById(modelId)?.name ?? modelId;
}

function renderTranscript(session: DeliberationSession): string {
  if (session.messages.length === 0) {
    return "No messages yet.";
  }

  return session.messages
    .filter((msg) => msg.status === "complete")
    .map((msg) => {
      if (msg.role === "user") {
        return `[User]: ${msg.content}`;
      }
      if (msg.role === "system") {
        return `[System]: ${msg.content}`;
      }
      const name = msg.modelName ?? msg.modelId ?? "Unknown";
      return `[${name}]: ${msg.content}`;
    })
    .join("\n\n");
}

export function buildDeliberationTurnPrompt(
  session: DeliberationSession,
  modelId: string,
  archetypeSnippet?: string
): { system: string; user: string } {
  const alias = getAlias(session, modelId);

  const baseSystem = [
    "You are a participant in a live group deliberation — think of it as an expert roundtable discussion.",
    `Your identity is ${alias}.`,
    "Respond conversationally, like you're talking to peers in a real discussion — not writing an essay.",
    "Think deeply but keep your responses concise. A few focused paragraphs at most, unless the topic truly demands more.",
    "No rigid structure or headers — just speak naturally. Build on what others have said, agree, disagree, refine, or introduce new angles.",
    "Do not repeat points already made. Do not use bullet lists or markdown headers unless genuinely helpful.",
    "Be direct and substantive. Every sentence should add value."
  ].join(" ");

  const system = archetypeSnippet
    ? `${baseSystem}\n\nYour role in this deliberation: ${archetypeSnippet}`
    : baseSystem;

  const transcript = renderTranscript(session);

  const user = [
    `Question:\n${session.question.trim()}`,
    `Context:\n${renderContext(session.context)}`,
    `Conversation so far:\n${transcript}`,
    `Now respond as ${alias}.`
  ].join("\n\n");

  return { system, user };
}

export function buildJudgeSolutionPrompt(
  session: DeliberationSession,
  archetypeSnippet?: string
): { system: string; user: string } {
  const baseSystem = [
    "You are the judge in a group deliberation.",
    "Read the entire deliberation transcript carefully.",
    "Produce exactly 2 to 5 concrete solution options based on the discussion.",
    "Each option should have a letter label (A, B, C, ...) and a clear, specific description.",
    "Format each option on its own line as: `LABEL: Description`",
    "Example:",
    "A: Implement the caching layer with Redis for low-latency reads",
    "B: Use a write-through cache with the existing database",
    "Do not include any other text before or after the options."
  ].join(" ");

  const system = archetypeSnippet
    ? `${baseSystem}\n\nYour judging approach: ${archetypeSnippet}`
    : baseSystem;

  const transcript = renderTranscript(session);

  const user = [
    `Question:\n${session.question.trim()}`,
    `Context:\n${renderContext(session.context)}`,
    `Full deliberation transcript:\n${transcript}`,
    "Now produce 2-5 labeled solution options."
  ].join("\n\n");

  return { system, user };
}

export function buildVotePrompt(
  session: DeliberationSession,
  modelId: string,
  solutions: JudgeSolution[],
  archetypeSnippet?: string
): { system: string; user: string } {
  const alias = getAlias(session, modelId);

  const baseSystem = [
    "You are a participant voting on the best solution.",
    `Your identity is ${alias}.`,
    "Pick exactly ONE solution from the list below and explain your reasoning.",
    'Respond with valid JSON only: {"choice": "A", "reasoning": "Your explanation here"}',
    "Do not include any text outside the JSON object."
  ].join(" ");

  const system = archetypeSnippet
    ? `${baseSystem}\n\nYour role: ${archetypeSnippet}`
    : baseSystem;

  const solutionList = solutions
    .map((s) => `${s.label}: ${s.description}`)
    .join("\n");

  const user = [
    `Question:\n${session.question.trim()}`,
    "Solutions to vote on:",
    solutionList,
    `Pick one solution and respond with JSON: {"choice": "LETTER", "reasoning": "..."}`
  ].join("\n\n");

  return { system, user };
}
