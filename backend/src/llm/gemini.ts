import { isFlowchart } from '@floo/shared'

import { RateWindow } from '../rateLimit.js'
import { buildEditContent, buildRepairContent, buildUserContent } from './content.js'
import { EDIT_PROMPT, EXPAND_PROMPT, REPAIR_PROMPT, SYSTEM_PROMPT } from './prompts.js'
import { parseFlowchartContent } from './groq.js'

import type { Flowchart, ValidationIssue } from '@floo/shared'
import type { FlowchartProvider, FlowchartRequest } from './adapter.js'

export interface GeminiOptions {
  apiKey: string
  model: string
  fetchImpl?: typeof fetch
  /** Shared RPM budget across all Gemini tiers; block() on upstream 429. */
  rateLimit?: RateWindow
}

/**
 * Lists every `*-flash-lite` model this API key can call, sorted
 * descending (latest version first). Hard-filters the id suffix and
 * requires generateContent support; deprecated ids are kept — the
 * fallback chain skips any that fail at call time.
 */
export async function listFlashLiteModels(
  options: { apiKey: string; fetchImpl?: typeof fetch },
): Promise<string[]> {
  const fetchImpl = options.fetchImpl ?? fetch
  const ids: string[] = []
  let pageToken: string | undefined

  do {
    const url = new URL('https://generativelanguage.googleapis.com/v1beta/models')
    url.searchParams.set('pageSize', '1000')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetchImpl(url.toString(), {
      headers: { 'x-goog-api-key': options.apiKey },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      throw new Error(`Gemini models.list failed: ${body?.error?.message ?? `HTTP ${res.status}`}`)
    }

    const data = (await res.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>
      nextPageToken?: string
    }

    for (const model of data.models ?? []) {
      const id = (model.name ?? '').replace(/^models\//, '')
      if (!id.endsWith('-flash-lite')) continue
      const methods = model.supportedGenerationMethods
      if (methods && methods.length > 0 && !methods.includes('generateContent')) continue
      ids.push(id)
    }

    pageToken = data.nextPageToken
  } while (pageToken)

  return dedupeDescending(ids)
}

/** Numeric version compare on `gemini-X[.Y[.Z]]-flash-lite`, newest first. */
function flashLiteVersion(id: string): number[] {
  const match = id.match(/^gemini-(\d+)(?:\.(\d+))?(?:\.(\d+))?-flash-lite$/)
  if (!match) return [-1]
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

function dedupeDescending(ids: string[]): string[] {
  const unique = [...new Set(ids)]
  return unique.sort((a, b) => {
    const va = flashLiteVersion(a)
    const vb = flashLiteVersion(b)
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const d = (vb[i] ?? 0) - (va[i] ?? 0)
      if (d !== 0) return d
    }
    return a.localeCompare(b)
  })
}

/** Pin an optional primary ahead of the dynamic list (no duplicates). */
export function orderWithPin(models: string[], pin?: string): string[] {
  const trimmed = pin?.trim()
  if (!trimmed) return models
  return [trimmed, ...models.filter((m) => m !== trimmed)]
}

async function callGemini(
  options: GeminiOptions,
  systemInstruction: string,
  userText: string,
): Promise<string> {
  if (options.rateLimit && !options.rateLimit.tryConsume()) {
    throw new Error('Gemini RPM budget exhausted — skipping to the next tier.')
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent`

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': options.apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        thinkingLevel: 'minimal',
      },
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    const message = body?.error?.message ?? `HTTP ${res.status}`
    if (res.status === 429) {
      // Shared budget blocks every Gemini tier so the chain jumps to Groq.
      const retryAfterSec = Number(res.headers.get('retry-after'))
      const blockMs =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 60_000
      options.rateLimit?.block(blockMs)
      console.warn(`[gemini] ${options.model} HTTP 429 — blocking Gemini tiers for ${blockMs}ms`)
    }
    throw new Error(`Gemini request failed: ${message}`)
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text) throw new Error('Gemini returned an empty response.')
  return text
}

function requireFlowchart(text: string, phase: string): Flowchart {
  const parsed = parseFlowchartContent(text)
  if (!isFlowchart(parsed)) {
    throw new Error(`Gemini returned invalid flowchart JSON during ${phase}.`)
  }
  return parsed
}

/**
 * Full FlowchartProvider on a single Gemini flash-lite model.
 * Failures throw — FallbackProvider advances to the next tier.
 */
export class GeminiAdapter implements FlowchartProvider {
  private options: GeminiOptions

  constructor(
    apiKey: string,
    model: string,
    fetchImpl?: typeof fetch,
    rateLimit?: RateWindow,
  ) {
    this.options = { apiKey, model, fetchImpl, rateLimit }
  }

  async generateFlowchart(request: FlowchartRequest): Promise<Flowchart> {
    const text = await callGemini(this.options, SYSTEM_PROMPT, buildUserContent(request))
    return requireFlowchart(text, 'generation')
  }

  async repairFlowchart(flowchart: Flowchart, issues: ValidationIssue[]): Promise<Flowchart> {
    const text = await callGemini(this.options, REPAIR_PROMPT, buildRepairContent(flowchart, issues))
    return requireFlowchart(text, 'repair')
  }

  async editFlowchart(current: Flowchart, request: FlowchartRequest): Promise<Flowchart> {
    const text = await callGemini(this.options, EDIT_PROMPT, buildEditContent(current, request))
    return requireFlowchart(text, 'edit')
  }
}

/**
 * Best-effort expansion call: asks Gemini flash-lite to re-expand an
 * oversimplified flowchart so it matches the original description.
 * Throws on any API/parsing failure — callers keep the primary result.
 */
export async function expandFlowchart(
  options: GeminiOptions,
  request: FlowchartRequest,
  current: Flowchart,
): Promise<unknown> {
  const userParts = [`Original description:\n\n${request.prompt}`]
  if (request.context?.length) {
    userParts.push(`Additional context:\n${request.context.join('\n---\n')}`)
  }
  userParts.push(`Current oversimplified flowchart:\n\n${JSON.stringify(current, null, 2)}`)
  userParts.push('Expand the flowchart so it fully matches the description.')

  const text = await callGemini(options, EXPAND_PROMPT, userParts.join('\n\n'))
  return parseFlowchartContent(text)
}
