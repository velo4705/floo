/** A detailed description (chars) that should yield at least this many nodes. */
export const DETAILED_PROMPT_MIN_CHARS = 100
export const DETAILED_PROMPT_MIN_NODES = 5

/**
 * True when a detailed description produced a suspiciously tiny chart —
 * the single source of truth for "silent oversimplification" detection,
 * shared by the frontend warning and the backend Gemini-aid trigger.
 */
export function isLikelyOversimplified(prompt: string, nodeCount: number): boolean {
  return prompt.trim().length >= DETAILED_PROMPT_MIN_CHARS && nodeCount < DETAILED_PROMPT_MIN_NODES
}
