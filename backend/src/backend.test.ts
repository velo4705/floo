import { describe, expect, it } from 'vitest'

import { createBackend } from './backend.js'

function groqOnly(overrides: Parameters<typeof createBackend>[0] = {}) {
  const warnings: string[] = []
  const backend = createBackend({
    groqApiKey: 'test-groq-key',
    groqModel: 'llama-3.3-70b-versatile',
    rateLimitPerMinute: 0,
    dailyBudget: 0,
    warn: (message) => warnings.push(message),
    ...overrides,
  })
  return { backend, warnings }
}

describe('createBackend', () => {
  it('reports a fatal config when no API keys are set', async () => {
    const backend = createBackend({ warn: () => {} })
    expect(backend.fatal).toMatch(/GEMINI_API_KEY/)

    const res = await backend.app.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'hello' }),
    })
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toMatchObject({ error: expect.stringContaining('GEMINI_API_KEY') })
  })

  it('answers health checks even when no keys are set', async () => {
    const backend = createBackend({ warn: () => {} })
    const res = await backend.app.request('/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('builds a Groq-only chain without touching the network', async () => {
    const { backend, warnings } = groqOnly()
    expect(backend.fatal).toBeNull()

    const info = await backend.init()
    expect(info.tiers).toEqual(['llama-3.3-70b-versatile'])
    expect(info.oversimplifyAidModel).toBeUndefined()
    expect(warnings).toContain('GEMINI_API_KEY not set — skipping Gemini tiers.')
  })

  it('defaults the Groq model when none is pinned', async () => {
    const backend = createBackend({ groqApiKey: 'test-groq-key', warn: () => {} })
    const info = await backend.init()
    expect(info.tiers).toEqual(['openai/gpt-oss-120b'])
  })

  it('memoizes init so model discovery runs once per instance', async () => {
    const { backend } = groqOnly()
    const first = backend.init()
    const second = backend.init()
    expect(second).toBe(first)
    await expect(first).resolves.toMatchObject({ tiers: ['llama-3.3-70b-versatile'] })
  })

  it('describes the active model chain and limits', async () => {
    const { backend } = groqOnly({ maxConcurrentLlm: 3, geminiRpm: 11 })
    const lines = backend.describe(await backend.init()).join('\n')
    expect(lines).toContain('model chain: llama-3.3-70b-versatile')
    expect(lines).toContain('0/min per IP')
    expect(lines).toContain('Gemini 11 RPM')
    expect(lines).toContain('max 3 concurrent LLM calls')
    expect(lines).not.toContain('oversimplification aid')
  })
})
