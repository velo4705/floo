import { describe, expect, it, vi } from 'vitest'

import { createApp } from './app.js'

import type { FlowchartProvider } from './llm/adapter.js'
import type { Flowchart } from '@floo/shared'

const mockFlowchart: Flowchart = {
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

function mockProvider(overrides?: Partial<FlowchartProvider>): FlowchartProvider {
  return {
    generateFlowchart: vi.fn().mockResolvedValue(mockFlowchart),
    ...overrides,
  }
}

describe('POST /api/generate', () => {
  it('returns 400 when prompt is missing', async () => {
    const app = createApp(mockProvider(), { rateLimitPerMinute: 0 })
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toMatchObject({ error: expect.stringContaining('prompt') })
  })

  it('returns 400 when prompt is empty', async () => {
    const app = createApp(mockProvider(), { rateLimitPerMinute: 0 })
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: '   ' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when prompt exceeds the character cap', async () => {
    const app = createApp(mockProvider(), { rateLimitPerMinute: 0 })
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'x'.repeat(2001) }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toMatchObject({ error: expect.stringContaining('at most 2000') })
  })

  it('returns 400 when context has too many items', async () => {
    const app = createApp(mockProvider(), { rateLimitPerMinute: 0 })
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'ok', context: ['a', 'b', 'c', 'd'] }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toMatchObject({ error: expect.stringContaining('at most 3') })
  })

  it('returns 400 when a context item is too long', async () => {
    const app = createApp(mockProvider(), { rateLimitPerMinute: 0 })
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'ok', context: ['y'.repeat(4001)] }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toMatchObject({ error: expect.stringContaining('at most 4000') })
  })

  it('returns 429 with Retry-After after rate limit per IP', async () => {
    const app = createApp(mockProvider(), { rateLimitPerMinute: 2 })
    const call = () =>
      app.request('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'ship an app' }),
      })

    expect((await call()).status).toBe(200)
    expect((await call()).status).toBe(200)
    const blocked = await call()
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('Retry-After')).toBeTruthy()
    const body = await blocked.json()
    expect(body).toMatchObject({ error: expect.stringContaining('Rate limit') })
  })

  it('returns 429 when the daily budget is exhausted', async () => {
    const app = createApp(mockProvider(), { rateLimitPerMinute: 0, dailyBudget: 1 })
    const call = () =>
      app.request('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'ship an app' }),
      })

    expect((await call()).status).toBe(200)
    const blocked = await call()
    expect(blocked.status).toBe(429)
    const body = await blocked.json()
    expect(body).toMatchObject({ error: expect.stringContaining('Daily') })
  })

  it('returns the flowchart on success', async () => {
    const provider = mockProvider()
    const app = createApp(provider, { rateLimitPerMinute: 0 })
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'ship an app' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Flowchart
    expect(body.nodes).toHaveLength(3)
    expect(body.edges).toHaveLength(2)
    expect(provider.generateFlowchart).toHaveBeenCalledWith({
      prompt: 'ship an app',
      context: undefined,
    })
  })

  it('passes context through to the provider', async () => {
    const provider = mockProvider()
    const app = createApp(provider, { rateLimitPerMinute: 0 })
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'map the process', context: ['step 1', 'step 2'] }),
    })
    expect(res.status).toBe(200)
    expect(provider.generateFlowchart).toHaveBeenCalledWith({
      prompt: 'map the process',
      context: ['step 1', 'step 2'],
    })
  })

  it('returns 502 when the provider throws', async () => {
    const app = createApp(
      mockProvider({
        generateFlowchart: vi.fn().mockRejectedValue(new Error('Groq is down')),
      }),
      { rateLimitPerMinute: 0 },
    )
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'fail please' }),
    })
    expect(res.status).toBe(502)
    const body = (await res.json()) as { error: string }
    expect(body).toMatchObject({ error: 'Groq is down' })
  })

  it('uses generateOutcome and sets X-Floo-Aid when the provider expanded an oversimplified result', async () => {
    const provider = mockProvider({
      generateOutcome: vi.fn().mockResolvedValue({
        flowchart: mockFlowchart,
        expandedBy: 'Gemini Flash-Lite',
      }),
    })
    const app = createApp(provider, { rateLimitPerMinute: 0 })
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'ship an app' }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Floo-Aid')).toBe('Gemini Flash-Lite')
    const body = (await res.json()) as Flowchart
    expect(body.nodes).toHaveLength(3)
    expect(provider.generateOutcome).toHaveBeenCalledWith({ prompt: 'ship an app', context: undefined })
    expect(provider.generateFlowchart).not.toHaveBeenCalled()
  })

  it('omits X-Floo-Aid when generateOutcome reports no aid', async () => {
    const provider = mockProvider({
      generateOutcome: vi.fn().mockResolvedValue({ flowchart: mockFlowchart }),
    })
    const app = createApp(provider, { rateLimitPerMinute: 0 })
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'ship an app' }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Floo-Aid')).toBeNull()
  })

  it('falls back to generateFlowchart when generateOutcome is absent', async () => {
    const provider = mockProvider()
    const app = createApp(provider, { rateLimitPerMinute: 0 })
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'ship an app' }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Floo-Aid')).toBeNull()
    expect(provider.generateFlowchart).toHaveBeenCalled()
  })
})

describe('POST /api/edit', () => {
  it('returns 400 when the prompt is missing', async () => {
    const app = createApp(mockProvider(), { rateLimitPerMinute: 0 })
    const res = await app.request('/api/edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ current: mockFlowchart }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when the current flowchart is not a flowchart', async () => {
    const app = createApp(mockProvider(), { rateLimitPerMinute: 0 })
    const res = await app.request('/api/edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'add a step', current: { nodes: 'nope' } }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when the backend does not support editing', async () => {
    const app = createApp(mockProvider(), { rateLimitPerMinute: 0 })
    const res = await app.request('/api/edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'add a step', current: mockFlowchart }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('does not support editing')
  })

  it('returns the edited flowchart on success and passes the current diagram through', async () => {
    const edited: Flowchart = {
      nodes: [...mockFlowchart.nodes, { id: 'n9', type: 'process', label: 'New', position: { x: 0, y: 0 } }],
      edges: [...mockFlowchart.edges, { id: 'e9', source: 'n2', target: 'n9' }],
    }
    const provider = mockProvider({ editFlowchart: vi.fn().mockResolvedValue(edited) })
    const app = createApp(provider, { rateLimitPerMinute: 0 })

    const res = await app.request('/api/edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'add a step', current: mockFlowchart }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(edited)
    expect(provider.editFlowchart).toHaveBeenCalledWith(mockFlowchart, {
      prompt: 'add a step',
      context: undefined,
    })
  })

  it('appends a canvas-mark hint when markedNodeIds reference real nodes', async () => {
    const provider = mockProvider({ editFlowchart: vi.fn().mockResolvedValue(mockFlowchart) })
    const app = createApp(provider, { rateLimitPerMinute: 0 })

    const res = await app.request('/api/edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'fix this',
        current: mockFlowchart,
        markedNodeIds: ['n2', 'ghost', 'n2'],
      }),
    })
    expect(res.status).toBe(200)
    expect(provider.editFlowchart).toHaveBeenCalledWith(mockFlowchart, {
      prompt: expect.stringContaining('fix this\n\n[Canvas marks]'),
      context: undefined,
    })
    const call = vi.mocked(provider.editFlowchart!).mock.calls[0]![1] as { prompt: string }
    expect(call.prompt).toContain('"Do thing"')
    expect(call.prompt).not.toContain('ghost')
  })

  it('keeps the prompt untouched when no marked id resolves to a node', async () => {
    const provider = mockProvider({ editFlowchart: vi.fn().mockResolvedValue(mockFlowchart) })
    const app = createApp(provider, { rateLimitPerMinute: 0 })

    const res = await app.request('/api/edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'fix this',
        current: mockFlowchart,
        markedNodeIds: ['ghost'],
      }),
    })
    expect(res.status).toBe(200)
    expect(provider.editFlowchart).toHaveBeenCalledWith(mockFlowchart, {
      prompt: 'fix this',
      context: undefined,
    })
  })

  it('returns 400 when markedNodeIds is malformed', async () => {
    const app = createApp(mockProvider({ editFlowchart: vi.fn().mockResolvedValue(mockFlowchart) }), {
      rateLimitPerMinute: 0,
    })
    const payloads: unknown[] = [
      'n2',
      [1],
      Array.from({ length: 51 }, (_, i) => `n${i}`),
    ]
    for (const markedNodeIds of payloads) {
      const res = await app.request('/api/edit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'fix', current: mockFlowchart, markedNodeIds }),
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('markedNodeIds')
    }
  })

  it('returns 502 when the provider edit throws', async () => {
    const app = createApp(
      mockProvider({
        editFlowchart: vi.fn().mockRejectedValue(new Error('edit boom')),
      }),
      { rateLimitPerMinute: 0 },
    )
    const res = await app.request('/api/edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'add a step', current: mockFlowchart }),
    })
    expect(res.status).toBe(502)
    const body = (await res.json()) as { error: string }
    expect(body).toMatchObject({ error: 'edit boom' })
  })
})