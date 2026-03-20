/**
 * Generates themed codename aliases for council models so they don't
 * refer to each other by their real model names during deliberation.
 */

const FALLBACK_ALIASES = [
  "Arbiter", "Helix", "Meridian", "Solace", "Cipher",
  "Vanguard", "Prism", "Zenith", "Aegis", "Lumen",
  "Vertex", "Sable", "Onyx", "Flint", "Corvus",
  "Talon", "Basalt", "Ember", "Nimbus", "Crux",
];

const ALIAS_MODEL = "google/gemini-3-flash-preview";

/**
 * Generate unique codename aliases for a list of model IDs.
 * Calls Gemini Flash to generate creative names, with a hardcoded
 * fallback pool if the API call fails.
 */
export async function generateCouncilAliases(
  modelIds: string[]
): Promise<Record<string, string>> {
  const count = modelIds.length;
  if (count === 0) return {};

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ALIAS_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You generate unique, single-word codenames for participants in a deliberation council. " +
              "Names should be evocative and distinct — think mythical, elemental, or abstract concepts " +
              "(e.g., Arbiter, Helix, Meridian, Solace, Cipher, Vanguard). " +
              "Return ONLY the names, one per line, no numbering, no explanation.",
          },
          {
            role: "user",
            content: `Generate exactly ${count} unique codename${count > 1 ? "s" : ""}. One per line.`,
          },
        ],
        temperature: 1.0,
        maxTokens: 200,
      }),
    });

    if (!response.ok) throw new Error("API call failed");

    const json = (await response.json()) as { content?: string };
    if (!json.content) throw new Error("Empty response");

    const names = json.content
      .split("\n")
      .map((line) => line.replace(/^\d+[\.\)\-\s]*/, "").trim())
      .filter((line) => line.length > 0 && line.length < 30);

    if (names.length >= count) {
      const map: Record<string, string> = {};
      for (let i = 0; i < count; i++) {
        map[modelIds[i]] = names[i];
      }
      return map;
    }

    // Not enough names — fall through to fallback
  } catch {
    // Fall through to fallback
  }

  return fallbackAliases(modelIds);
}

function fallbackAliases(modelIds: string[]): Record<string, string> {
  // Shuffle the fallback pool and assign
  const shuffled = [...FALLBACK_ALIASES].sort(() => Math.random() - 0.5);
  const map: Record<string, string> = {};
  for (let i = 0; i < modelIds.length; i++) {
    map[modelIds[i]] = shuffled[i % shuffled.length];
  }
  return map;
}
