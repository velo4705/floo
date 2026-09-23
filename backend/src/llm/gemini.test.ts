import { describe, expect, it, vi } from 'vitest'

import { expandFlowchart, GeminiAdapter, listFlashLiteModels, orderWithPin } from './gemini.js'

import type { Flowchart } from '@floo/shared'

const flowchart: Flowchart = {
  nodes: [
    { id: 'n1', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
    { id: 'n2', type: 'process', label: 'Do thing', position: { x: 0, y: 0 } },
    { id: 'n3', type: 'end', label: 'End', position: { x: 0, y: 0 } },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
  ],
}

const request = { prompt: 'p'.repeat(120) }
const MODEL = 'gemini-9.9-flash-lite'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function listResponse(
  models: Array<{ name: string; supportedGenerationMethods?: string[] }>,
  nextPageToken?: string,
): Response {
  return jsonResponse({ models, ...(nextPageToken ? { nextPageToken } : {}) })
}

function okGenerate(): Response {
  return jsonResponse({
    candidates: [{ content: { parts: [{ text: JSON.stringify(flowchart) }] } }],
  })
}

describe('listFlashLiteModels', () => {
  it('keeps only *-flash-lite ids that support generateContent, newest first', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      listResponse([
        { name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-flash-lite-latest', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-1.0-flash-lite-embedding', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/some-embedding-flash-lite', supportedGenerationMethods: ['embedContent'] },
      ]),
    ) as unknown as typeof fetch

    const models = await listFlashLiteModels({ apiKey: 'k', fetchImpl })

    expect(models).toEqual([
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash-lite',
    ])
    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('generativelanguage.googleapis.com')
    expect(url).toContain('pageSize=1000')
  })

  it('treats a missing supportedGenerationMethods field as usable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      listResponse([{ name: 'models/gemini-3.5-flash-lite' }]),
    ) as unknown as typeof fetch

    expect(await listFlashLiteModels({ apiKey: 'k', fetchImpl })).toEqual(['gemini-3.5-flash-lite'])
  })

  it('sorts single-segment versions correctly (3 > 2.5 > 2.10 is numeric)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      listResponse([
        { name: 'models/gemini-2.10-flash-lite' },
        { name: 'models/gemini-3-flash-lite' },
        { name: 'models/gemini-2.5-flash-lite' },
      ]),
    ) as unknown as typeof fetch

    expect(await listFlashLiteModels({ apiKey: 'k', fetchImpl })).toEqual([
      'gemini-3-flash-lite',
      'gemini-2.10-flash-lite',
      'gemini-2.5-flash-lite',
    ])
  })

  it('follows nextPageToken across pages and dedupes', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        listResponse(
          [{ name: 'models/gemini-3.5-flash-lite' }],
          'page2',
        ),
      )
      .mockResolvedValueOnce(
        listResponse([
          { name: 'models/gemini-3.5-flash-lite' },
          { name: 'models/gemini-3.1-flash-lite' },
        ]),
      ) as unknown as typeof fetch

    const models = await listFlashLiteModels({ apiKey: 'k', fetchImpl })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(models).toEqual(['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'])
    const secondCall = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[1] as unknown[]
    expect(String(secondCall[0])).toContain('pageToken=page2')
  })

  it('throws with the API error message on non-OK responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ error: { message: 'API key not valid' } }, 400),
    ) as unknown as typeof fetch

    await expect(listFlashLiteModels({ apiKey: 'bad', fetchImpl })).rejects.toThrow(
      'API key not valid',
    )
  })

  it('returns an empty list when nothing matches', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      listResponse([{ name: 'models/gemini-3.8-flash' }]),
    ) as unknown as typeof fetch

    expect(await listFlashLiteModels({ apiKey: 'k', fetchImpl })).toEqual([])
  })
})

describe('orderWithPin', () => {
  it('returns the list unchanged when no pin', () => {
    expect(orderWithPin(['a', 'b'])).toEqual(['a', 'b'])
    expect(orderWithPin(['a', 'b'], '  ')).toEqual(['a', 'b'])
  })

  it('puts the pin first without duplicating', () => {
    expect(orderWithPin(['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'], 'gemini-3.1-flash-lite')).toEqual([
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
    ])
  })

  it('prepends a pin that is not in the list', () => {
    expect(orderWithPin(['gemini-3.1-flash-lite'], 'gemini-4.0-flash-lite')).toEqual([
      'gemini-4.0-flash-lite',
      'gemini-3.1-flash-lite',
    ])
  })
})

describe('expandFlowchart', () => {
  it('posts to the generateContent endpoint and parses JSON text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okGenerate()) as unknown as typeof fetch

    const result = await expandFlowchart({ apiKey: 'k', model: MODEL, fetchImpl }, request, flowchart)

    expect(result).toEqual(flowchart)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`${MODEL}:generateContent`)
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k')
    const payload = JSON.parse(String(init.body)) as {
      generationConfig: { responseMimeType: string }
      systemInstruction: { parts: Array<{ text: string }> }
      contents: Array<{ parts: Array<{ text: string }> }>
    }
    expect(payload.generationConfig.responseMimeType).toBe('application/json')
    expect(payload.systemInstruction.parts[0]?.text).toContain('oversimplified')
    expect(payload.contents[0]?.parts[0]?.text).toContain('Original description:')
    expect(payload.contents[0]?.parts[0]?.text).toContain('Current oversimplified flowchart:')
  })

  it('uses the provided model in the endpoint URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okGenerate()) as unknown as typeof fetch

    await expandFlowchart({ apiKey: 'k', model: 'gemini-custom-model', fetchImpl }, request, flowchart)

    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('gemini-custom-model:generateContent')
  })

  it('does not send temperature (stripped for Gemini 3+)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okGenerate()) as unknown as typeof fetch

    await expandFlowchart({ apiKey: 'k', model: MODEL, fetchImpl }, request, flowchart)

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>
    const generationConfig = payload.generationConfig as Record<string, unknown>
    expect(generationConfig).not.toHaveProperty('temperature')
    expect(generationConfig).not.toHaveProperty('topP')
    expect(generationConfig.maxOutputTokens).toBe(8192)
  })

  it('throws with the API error message on non-OK responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ error: { message: 'API key not valid' } }, 400),
    ) as unknown as typeof fetch

    await expect(expandFlowchart({ apiKey: 'bad', model: MODEL, fetchImpl }, request, flowchart)).rejects.toThrow(
      'API key not valid',
    )
  })

  it('falls back to HTTP status when the error body has no message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 503 })) as unknown as typeof fetch

    await expect(expandFlowchart({ apiKey: 'k', model: MODEL, fetchImpl }, request, flowchart)).rejects.toThrow(
      'HTTP 503',
    )
  })

  it('throws when the candidate has no text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ candidates: [{}] })) as unknown as typeof fetch

    await expect(expandFlowchart({ apiKey: 'k', model: MODEL, fetchImpl }, request, flowchart)).rejects.toThrow(
      /empty response/,
    )
  })

  it('throws when the text contains no extractable JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ candidates: [{ content: { parts: [{ text: 'sorry, I cannot help' }] } }] }),
    ) as unknown as typeof fetch

    await expect(expandFlowchart({ apiKey: 'k', model: MODEL, fetchImpl }, request, flowchart)).rejects.toThrow(
      /Could not extract JSON/,
    )
  })

  it('propagates network failures', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch

    await expect(expandFlowchart({ apiKey: 'k', model: MODEL, fetchImpl }, request, flowchart)).rejects.toThrow(
      'network down',
    )
  })

  it('includes context sections when provided', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okGenerate()) as unknown as typeof fetch

    await expandFlowchart({ apiKey: 'k', model: MODEL, fetchImpl }, { prompt: 'p', context: ['note one'] }, flowchart)

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(String(init.body)) as { contents: Array<{ parts: Array<{ text: string }> }> }
    expect(payload.contents[0]?.parts[0]?.text).toContain('note one')
  })
})

describe('GeminiAdapter', () => {
  it('generates a flowchart via generateContent with the system prompt', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okGenerate()) as unknown as typeof fetch
    const adapter = new GeminiAdapter('k', MODEL, fetchImpl)

    const result = await adapter.generateFlowchart(request)

    expect(result).toEqual(flowchart)
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`${MODEL}:generateContent`)
    const payload = JSON.parse(String(init.body)) as {
      systemInstruction: { parts: Array<{ text: string }> }
      contents: Array<{ parts: Array<{ text: string }> }>
    }
    expect(payload.systemInstruction.parts[0]?.text).toContain('expert flowchart designer')
    expect(payload.contents[0]?.parts[0]?.text).toContain('Describe the process')
  })

  it('throws on API errors so the fallback tier can advance', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ error: { message: 'quota exceeded' } }, 429),
    ) as unknown as typeof fetch
    const adapter = new GeminiAdapter('k', MODEL, fetchImpl)

    await expect(adapter.generateFlowchart(request)).rejects.toThrow('quota exceeded')
  })

  it('throws when the model returns invalid flowchart JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ candidates: [{ content: { parts: [{ text: '{"nodes":"nope"}' }] } }] }),
    ) as unknown as typeof fetch
    const adapter = new GeminiAdapter('k', MODEL, fetchImpl)

    await expect(adapter.generateFlowchart(request)).rejects.toThrow(/invalid flowchart JSON/)
  })

  it('repairs with the repair prompt', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okGenerate()) as unknown as typeof fetch
    const adapter = new GeminiAdapter('k', MODEL, fetchImpl)

    await adapter.repairFlowchart(flowchart, [
      { kind: 'missing-end', severity: 'error', message: 'missing end' },
    ])

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(String(init.body)) as {
      systemInstruction: { parts: Array<{ text: string }> }
      contents: Array<{ parts: Array<{ text: string }> }>
    }
    expect(payload.systemInstruction.parts[0]?.text).toContain('repair engine')
    expect(payload.contents[0]?.parts[0]?.text).toContain('missing end')
  })

  it('edits with the edit prompt', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okGenerate()) as unknown as typeof fetch
    const adapter = new GeminiAdapter('k', MODEL, fetchImpl)

    await adapter.editFlowchart(flowchart, { prompt: 'add a step' })

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(String(init.body)) as {
      systemInstruction: { parts: Array<{ text: string }> }
      contents: Array<{ parts: Array<{ text: string }> }>
    }
    expect(payload.systemInstruction.parts[0]?.text).toContain('editing an existing flowchart')
    expect(payload.contents[0]?.parts[0]?.text).toContain('add a step')
  })
})
