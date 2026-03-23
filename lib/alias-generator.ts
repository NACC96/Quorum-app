/**
 * Preset codename aliases for council models so they don't
 * refer to each other by their real model names during deliberation.
 */

export const PRESET_ALIASES = [
  "Arbiter", "Helix", "Meridian", "Solace", "Cipher",
  "Vanguard", "Prism", "Zenith", "Aegis", "Lumen",
  "Vertex", "Sable", "Onyx", "Flint", "Corvus",
  "Talon", "Basalt", "Ember", "Nimbus", "Crux",
];

/**
 * The sentinel value used in the alias dropdown to indicate
 * the user wants to type a custom name.
 */
export const CUSTOM_ALIAS_SENTINEL = "__custom__";

/**
 * Convert a slot-index-based alias map into the modelId-based
 * alias map that the rest of the system expects.
 */
export function buildAliasMap(
  modelIds: string[],
  slotAliases: Record<number, string>
): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = 0; i < modelIds.length; i++) {
    map[modelIds[i]] = slotAliases[i] ?? PRESET_ALIASES[i % PRESET_ALIASES.length];
  }
  return map;
}
