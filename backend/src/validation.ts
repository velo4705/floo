const MAX_PROMPT_CHARS = 2000
const MAX_CONTEXT_ITEMS = 3
const MAX_CONTEXT_CHARS = 4000
const MAX_MARKED_IDS = 50

type ParseOk = { ok: true; prompt: string; context?: string[] }
type ParseErr = { ok: false; error: string }
type ParseResult = ParseOk | ParseErr

export function parsePromptBody(body: Record<string, unknown> | null): ParseResult {
  if (typeof body?.prompt !== 'string' || body.prompt.trim().length === 0) {
    return { ok: false, error: 'prompt is required and must be a non-empty string' }
  }
  if (body.prompt.length > MAX_PROMPT_CHARS) {
    return {
      ok: false,
      error: `prompt must be at most ${MAX_PROMPT_CHARS} characters (got ${body.prompt.length})`,
    }
  }

  let context: string[] | undefined
  if (Array.isArray(body.context)) {
    const items = body.context.filter((x: unknown): x is string => typeof x === 'string')
    if (items.length > MAX_CONTEXT_ITEMS) {
      return {
        ok: false,
        error: `context must have at most ${MAX_CONTEXT_ITEMS} items (got ${items.length})`,
      }
    }
    const oversized = items.find((s) => s.length > MAX_CONTEXT_CHARS)
    if (oversized !== undefined) {
      return {
        ok: false,
        error: `each context item must be at most ${MAX_CONTEXT_CHARS} characters (got ${oversized.length})`,
      }
    }
    context = items
  }

  return { ok: true, prompt: body.prompt, context }
}

type MarkedOk = { ok: true; ids: string[] }
type MarkedErr = { ok: false; error: string }
type MarkedResult = MarkedOk | MarkedErr

export function parseMarkedIds(body: Record<string, unknown> | null): MarkedResult {
  const raw = body?.markedNodeIds
  if (raw === undefined || raw === null) return { ok: true, ids: [] }
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'markedNodeIds must be an array of strings' }
  }
  if (raw.some((x: unknown) => typeof x !== 'string')) {
    return { ok: false, error: 'markedNodeIds must contain only strings' }
  }
  if (raw.length > MAX_MARKED_IDS) {
    return {
      ok: false,
      error: `markedNodeIds must have at most ${MAX_MARKED_IDS} items (got ${raw.length})`,
    }
  }
  return { ok: true, ids: raw as string[] }
}

export { MAX_PROMPT_CHARS, MAX_CONTEXT_ITEMS, MAX_CONTEXT_CHARS, MAX_MARKED_IDS }
