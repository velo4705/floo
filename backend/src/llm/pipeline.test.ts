import { describe, expect, it, vi } from 'vitest'

import type { Flowchart } from '@floo/shared'

import { createGenPipeline } from './pipeline.js'

import type { FlowchartProvider } from './adapter.js'

function makeFlowchart(overrides: Partial<Flowchart> = {}): Flowchart {
  return {
    nodes: [
      { id: 'n1', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
      { id: 'n2', type: 'process', label: 'Do thing', position: { x: 0, y: 0 } },
      { id: 'n3', type: 'end', label: 'End', position: { x: 0, y: 0 } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
    ...overrides,
  }
}

/** A flowchart that rule-repair fixes: has a dangling edge */
function flowchartWithDanglingEdge(): Flowchart {
  return makeFlowchart({
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e9', source: 'ghost', target: 'n2' },
    ],
  })
}

const brokenWithDanglingEdge = flowchartWithDanglingEdge()
const clean: Flowchart = makeFlowchart()

describe('createGenPipeline', () => {
  it('returns a clean flowchart without calling repairs', async () => {
    const provider: FlowchartProvider = {
      generateFlowchart: vi.fn().mockResolvedValue(clean),
      repairFlowchart: vi.fn(),
    }
    const pipeline = createGenPipeline(provider)
    const result = await pipeline.generateFlowchart({ prompt: 'x' })
    expect(result).toEqual(clean)
    expect(provider.repairFlowchart).not.toHaveBeenCalled()
  })

  it('applies only rule-based repairs when they fix the flowchart', async () => {
    const provider: FlowchartProvider = {
      generateFlowchart: vi.fn().mockResolvedValue(brokenWithDanglingEdge),
      repairFlowchart: vi.fn(),
    }
    const pipeline = createGenPipeline(provider)
    const result = (await pipeline.generateFlowchart({ prompt: 'x' })) as Flowchart
    expect(result.edges.map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(provider.repairFlowchart).not.toHaveBeenCalled()
  })

  it('calls the model repair pass when rules cannot fix the issues', async () => {
    const noEnd = makeFlowchart({
      nodes: makeFlowchart().nodes.filter((n) => n.type !== 'end'),
    })
    const provider: FlowchartProvider = {
      generateFlowchart: vi.fn().mockResolvedValue(noEnd),
      repairFlowchart: vi.fn().mockResolvedValue(clean),
    }
    const pipeline = createGenPipeline(provider)
    const result = await pipeline.generateFlowchart({ prompt: 'x' })
    expect(result).toEqual(clean)
    expect(provider.repairFlowchart).toHaveBeenCalledTimes(1)
  })

  it('passes only the error issues to the model repair pass', async () => {
    const noEnd = makeFlowchart({
      nodes: makeFlowchart().nodes.filter((n) => n.type !== 'end'),
    })
    const provider: FlowchartProvider = {
      generateFlowchart: vi.fn().mockResolvedValue(noEnd),
      repairFlowchart: vi.fn().mockResolvedValue(clean),
    }
    const pipeline = createGenPipeline(provider, { maxRepairs: 1 })
    await pipeline.generateFlowchart({ prompt: 'x' })
    const passed = vi.mocked(provider.repairFlowchart!).mock.calls[0]?.[1]
    expect(passed?.every((i) => i.severity === 'error')).toBe(true)
  })

  it('stops retrying after maxRepairs and returns the best-effort flowchart', async () => {
    // No end node and no dangling edges (a cycle), so rule-repair cannot fix it.
    const persistentlyBroken: Flowchart = makeFlowchart({
      nodes: makeFlowchart().nodes.filter((n) => n.type !== 'end'),
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n1' },
      ],
    })
    const provider: FlowchartProvider = {
      generateFlowchart: vi.fn().mockResolvedValue(persistentlyBroken),
      repairFlowchart: vi.fn().mockResolvedValue(persistentlyBroken),
    }
    const pipeline = createGenPipeline(provider, { maxRepairs: 2 })
    const result = await pipeline.generateFlowchart({ prompt: 'x' })
    expect(result).toEqual(persistentlyBroken)
    expect(provider.repairFlowchart).toHaveBeenCalledTimes(2)
  })

  it('still applies rule repairs when the provider lacks a model repair pass', async () => {
    const provider: FlowchartProvider = {
      generateFlowchart: vi.fn().mockResolvedValue(brokenWithDanglingEdge),
    }
    const pipeline = createGenPipeline(provider)
    const result = (await pipeline.generateFlowchart({ prompt: 'x' })) as Flowchart
    expect(result.edges.map((e) => e.id)).toEqual(['e1', 'e2'])
  })

  it('throws when the model returns non-flowchart JSON', async () => {
    const provider: FlowchartProvider = {
      generateFlowchart: vi.fn().mockResolvedValue({ nodes: 'nope' }),
    }
    const pipeline = createGenPipeline(provider)
    await expect(pipeline.generateFlowchart({ prompt: 'x' })).rejects.toThrow(/not in the expected shape/)
  })

  it('throws when the model repair pass returns non-flowchart JSON', async () => {
    const noEnd = makeFlowchart({
      nodes: makeFlowchart().nodes.filter((n) => n.type !== 'end'),
    })
    const provider: FlowchartProvider = {
      generateFlowchart: vi.fn().mockResolvedValue(noEnd),
      repairFlowchart: vi.fn().mockResolvedValue({ nodes: [] }),
    }
    const pipeline = createGenPipeline(provider)
    await expect(pipeline.generateFlowchart({ prompt: 'x' })).rejects.toThrow(/not in the expected shape/)
  })
})

describe('createGenPipeline editFlowchart', () => {
  it('passes the current diagram through to the underlying edit call', async () => {
    const provider: FlowchartProvider = {
      generateFlowchart: vi.fn(),
      editFlowchart: vi.fn().mockResolvedValue(clean),
    }
    const pipeline = createGenPipeline(provider)
    const result = await pipeline.editFlowchart(clean, { prompt: 'add a step' })
    expect(result).toEqual(clean)
    expect(provider.editFlowchart).toHaveBeenCalledWith(clean, { prompt: 'add a step' })
  })

  it('applies rule repairs to a dirty edit response', async () => {
    const provider: FlowchartProvider = {
      generateFlowchart: vi.fn(),
      editFlowchart: vi.fn().mockResolvedValue(brokenWithDanglingEdge),
    }
    const pipeline = createGenPipeline(provider)
    const result = (await pipeline.editFlowchart(clean, { prompt: 'x' })) as Flowchart
    expect(result.edges.map((e) => e.id)).toEqual(['e1', 'e2'])
  })

  it('throws when the provider cannot edit', async () => {
    const provider: FlowchartProvider = {
      generateFlowchart: vi.fn(),
    }
    const pipeline = createGenPipeline(provider)
    await expect(pipeline.editFlowchart(clean, { prompt: 'x' })).rejects.toThrow(/does not support editing/)
  })
})