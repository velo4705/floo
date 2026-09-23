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
    const app = createApp(mockProvider())
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
    const app = createApp(mockProvider())
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: '   ' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns the flowchart on success', async () => {
    const provider = mockProvider()
    const app = createApp(provider)
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
    const app = createApp(provider)
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
    const app = createApp(provider)
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
    const app = createApp(provider)
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
    const app = createApp(provider)
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
    const app = createApp(mockProvider())
    const res = await app.request('/api/edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ current: mockFlowchart }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when the current flowchart is not a flowchart', async () => {
    const app = createApp(mockProvider())
    const res = await app.request('/api/edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'add a step', current: { nodes: 'nope' } }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when the backend does not support editing', async () => {
    const app = createApp(mockProvider())
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
    const app = createApp(provider)

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

  it('returns 502 when the provider edit throws', async () => {
    const app = createApp(
      mockProvider({
        editFlowchart: vi.fn().mockRejectedValue(new Error('edit boom')),
      }),
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