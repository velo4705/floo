const MAX_PROMPT_CHARS = 2000
const MAX_CONTEXT_ITEMS = 3
const MAX_CONTEXT_CHARS = 4000

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

export { MAX_PROMPT_CHARS, MAX_CONTEXT_ITEMS, MAX_CONTEXT_CHARS }
