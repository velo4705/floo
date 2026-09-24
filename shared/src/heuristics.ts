/** A detailed description (chars) that should yield at least this many nodes. */
export const DETAILED_PROMPT_MIN_CHARS = 100
export const DETAILED_PROMPT_MIN_NODES = 5

/**
 * A start → process → end skeleton is never right for a real request
 * (architecture, multi-step flows). Lower bar than the detailed rule so
 * short prompts like "system architecture for a chat app" still expand.
 */
export const SKELETON_MAX_NODES = 3
export const SKELETON_MIN_CHARS = 30

/**
 * True when a detailed description produced a suspiciously tiny chart —
 * the single source of truth for "silent oversimplification" detection,
 * shared by the frontend warning and the backend Gemini-aid trigger.
 */
export function isLikelyOversimplified(prompt: string, nodeCount: number): boolean {
  const chars = prompt.trim().length
  if (nodeCount <= SKELETON_MAX_NODES && chars >= SKELETON_MIN_CHARS) return true
  return chars >= DETAILED_PROMPT_MIN_CHARS && nodeCount < DETAILED_PROMPT_MIN_NODES
}
