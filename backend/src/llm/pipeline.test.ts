import { describe, expect, it, vi } from 'vitest'

import type { Flowchart } from '@floo/shared'

import { createGenPipeline, withOversimplifyAid } from './pipeline.js'

import type { FlowchartProvider } from './adapter.js'
import type { PipelineProvider } from './pipeline.js'

const DETAILED_PROMPT = 'a'.repeat(150)

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

describe('withOversimplifyAid', () => {
  const detailedPrompt = DETAILED_PROMPT

  function makePipelineBase(result: Flowchart): PipelineProvider {
    return {
      generateFlowchart: vi.fn().mockResolvedValue(result),
      editFlowchart: vi.fn().mockResolvedValue(result),
    } as unknown as PipelineProvider
  }

  function makeDetailedFlowchart(): Flowchart {
    const ids = ['s', 'a', 'b', 'c', 'd', 'e', 't']
    return {
      nodes: ids.map((id, i) => ({
        id,
        type: i === 0 ? ('start' as const) : i === ids.length - 1 ? ('end' as const) : ('process' as const),
        label: id,
        position: { x: 0, y: 0 },
      })),
      edges: ids.slice(0, -1).map((id, i) => ({
        id: `e${i}`,
        source: id,
        target: ids[i + 1]!,
      })),
    }
  }

  it('does not expand when the result already has enough nodes', async () => {
    const base = makePipelineBase(makeDetailedFlowchart())
    const expand = vi.fn()
    const wrapped = withOversimplifyAid(base, { expand, expandedBy: 'Gemini Flash-Lite' })
    const outcome = await wrapped.generateOutcome!({ prompt: detailedPrompt })
    expect(expand).not.toHaveBeenCalled()
    expect(outcome.expandedBy).toBeUndefined()
    expect(outcome.flowchart.nodes).toHaveLength(7)
  })

  it('does not expand for a short prompt', async () => {
    const base = makePipelineBase(clean)
    const expand = vi.fn()
    const wrapped = withOversimplifyAid(base, { expand, expandedBy: 'Gemini Flash-Lite' })
    const outcome = await wrapped.generateOutcome!({ prompt: 'short' })
    expect(expand).not.toHaveBeenCalled()
    expect(outcome.expandedBy).toBeUndefined()
    expect(outcome.flowchart).toEqual(clean)
  })

  it('expands an oversimplified result and reports the aid label', async () => {
    const base = makePipelineBase(clean)
    const expanded = makeDetailedFlowchart()
    const expand = vi.fn().mockResolvedValue(expanded)
    const wrapped = withOversimplifyAid(base, { expand, expandedBy: 'Gemini Flash-Lite' })
    const outcome = await wrapped.generateOutcome!({ prompt: detailedPrompt })
    expect(expand).toHaveBeenCalledWith({ prompt: detailedPrompt }, clean)
    expect(outcome.expandedBy).toBe('Gemini Flash-Lite')
    expect(outcome.flowchart).toEqual(expanded)
  })

  it('keeps the primary result when expansion throws', async () => {
    const base = makePipelineBase(clean)
    const expand = vi.fn().mockRejectedValue(new Error('gemini down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapped = withOversimplifyAid(base, { expand, expandedBy: 'Gemini Flash-Lite' })
    const outcome = await wrapped.generateOutcome!({ prompt: detailedPrompt })
    expect(outcome.flowchart).toEqual(clean)
    expect(outcome.expandedBy).toBeUndefined()
    warn.mockRestore()
  })

  it('keeps the primary result when expansion returns a non-flowchart', async () => {
    const base = makePipelineBase(clean)
    const expand = vi.fn().mockResolvedValue({ nodes: 'nope' })
    const wrapped = withOversimplifyAid(base, { expand, expandedBy: 'Gemini Flash-Lite' })
    const outcome = await wrapped.generateOutcome!({ prompt: detailedPrompt })
    expect(outcome.flowchart).toEqual(clean)
    expect(outcome.expandedBy).toBeUndefined()
  })

  it('keeps the primary result when expansion is not bigger', async () => {
    const base = makePipelineBase(clean)
    const expand = vi.fn().mockResolvedValue(makeFlowchart())
    const wrapped = withOversimplifyAid(base, { expand, expandedBy: 'Gemini Flash-Lite' })
    const outcome = await wrapped.generateOutcome!({ prompt: detailedPrompt })
    expect(outcome.flowchart).toEqual(clean)
    expect(outcome.expandedBy).toBeUndefined()
  })

  it('rule-repairs a dirty expansion before accepting it', async () => {
    const base = makePipelineBase(clean)
    const dirtyExpansion = makeDetailedFlowchart()
    dirtyExpansion.edges.push({ id: 'e9', source: 'ghost', target: 'a' })
    const expand = vi.fn().mockResolvedValue(dirtyExpansion)
    const repairFlowchart = vi.fn()
    const wrapped = withOversimplifyAid(base, { expand, expandedBy: 'Gemini Flash-Lite', repairFlowchart })
    const outcome = await wrapped.generateOutcome!({ prompt: detailedPrompt })
    expect(outcome.expandedBy).toBe('Gemini Flash-Lite')
    expect(outcome.flowchart.edges.map((e) => e.id)).not.toContain('e9')
    expect(outcome.flowchart.nodes).toHaveLength(7)
    expect(repairFlowchart).not.toHaveBeenCalled()
  })

  it('exposes generateFlowchart that returns just the flowchart', async () => {
    const base = makePipelineBase(clean)
    const expanded = makeDetailedFlowchart()
    const expand = vi.fn().mockResolvedValue(expanded)
    const wrapped = withOversimplifyAid(base, { expand, expandedBy: 'Gemini Flash-Lite' })
    const result = await wrapped.generateFlowchart({ prompt: detailedPrompt })
    expect(result).toEqual(expanded)
  })

  it('delegates editFlowchart to the base pipeline', async () => {
    const base = makePipelineBase(clean)
    const wrapped = withOversimplifyAid(base, { expand: vi.fn(), expandedBy: 'Gemini Flash-Lite' })
    const result = await wrapped.editFlowchart(clean, { prompt: 'add a step' })
    expect(result).toEqual(clean)
    expect(base.editFlowchart).toHaveBeenCalledWith(clean, { prompt: 'add a step' })
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