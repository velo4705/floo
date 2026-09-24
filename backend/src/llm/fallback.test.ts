import { describe, expect, it, vi } from 'vitest'

import { FallbackProvider } from './fallback.js'

import type { Flowchart } from '@floo/shared'
import type { FlowchartProvider } from './adapter.js'
import type { FallbackTier } from './fallback.js'

const chart: Flowchart = {
  nodes: [
    { id: 'n1', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
    { id: 'n2', type: 'end', label: 'End', position: { x: 0, y: 0 } },
  ],
  edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
}

const request = { prompt: 'do a thing' }

function tier(
  label: string,
  overrides: Partial<FlowchartProvider> & Pick<FlowchartProvider, 'generateFlowchart'>,
): FallbackTier {
  return { label, provider: overrides }
}

describe('FallbackProvider', () => {
  it('uses the first tier when it succeeds', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const first = vi.fn().mockResolvedValue(chart)
    const second = vi.fn().mockResolvedValue(chart)
    const provider = new FallbackProvider([
      tier('a', { generateFlowchart: first }),
      tier('b', { generateFlowchart: second }),
    ])

    const result = await provider.generateFlowchart(request)

    expect(result).toEqual(chart)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    const lines = log.mock.calls.map((args) => String(args[0]))
    expect(lines.some((l) => l.includes('chain = a → b'))).toBe(true)
    expect(lines.some((l) => l.includes('trying a'))).toBe(true)
    expect(lines.some((l) => l.includes('a OK in'))).toBe(true)
    warn.mockRestore()
    log.mockRestore()
  })

  it('logs each failed tier with timing before advancing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const provider = new FallbackProvider([
      tier('a', { generateFlowchart: vi.fn().mockRejectedValue(new Error('tier one down')) }),
      tier('b', { generateFlowchart: vi.fn().mockResolvedValue(chart) }),
    ])

    await provider.generateFlowchart(request)

    const warnLines = warn.mock.calls.map((args) => String(args[0]))
    expect(warnLines.some((l) => l.includes('[fallback] a generateFlowchart failed after'))).toBe(
      true,
    )
    const lines = log.mock.calls.map((args) => String(args[0]))
    expect(lines.some((l) => l.includes('b OK in'))).toBe(true)
    warn.mockRestore()
    log.mockRestore()
  })

  it('falls through to the next tier when the first throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const first = vi.fn().mockRejectedValue(new Error('tier one down'))
    const second = vi.fn().mockResolvedValue(chart)
    const provider = new FallbackProvider([
      tier('a', { generateFlowchart: first }),
      tier('b', { generateFlowchart: second }),
    ])

    const result = await provider.generateFlowchart(request)

    expect(result).toEqual(chart)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('preserves the original error when a single tier fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const provider = new FallbackProvider([
      tier('only', { generateFlowchart: vi.fn().mockRejectedValue(new Error('Groq is down')) }),
    ])

    await expect(provider.generateFlowchart(request)).rejects.toThrow('Groq is down')
    warn.mockRestore()
  })

  it('wraps the last error when all tiers fail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const provider = new FallbackProvider([
      tier('a', { generateFlowchart: vi.fn().mockRejectedValue(new Error('first boom')) }),
      tier('b', { generateFlowchart: vi.fn().mockRejectedValue(new Error('second boom')) }),
    ])

    await expect(provider.generateFlowchart(request)).rejects.toThrow(
      /All model tiers failed during generateFlowchart.*second boom/,
    )
    warn.mockRestore()
  })

  it('skips tiers without repairFlowchart', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const repair = vi.fn().mockResolvedValue(chart)
    const provider = new FallbackProvider([
      tier('gen-only', { generateFlowchart: vi.fn() }),
      tier('can-repair', { generateFlowchart: vi.fn(), repairFlowchart: repair }),
    ])

    const result = await provider.repairFlowchart(chart, [])

    expect(result).toEqual(chart)
    expect(repair).toHaveBeenCalledWith(chart, [])
    const lines = log.mock.calls.map((args) => String(args[0]))
    expect(lines.some((l) => l.includes('skip gen-only'))).toBe(true)
    warn.mockRestore()
    log.mockRestore()
  })

  it('falls through repair to the next capable tier', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const firstRepair = vi.fn().mockRejectedValue(new Error('repair down'))
    const secondRepair = vi.fn().mockResolvedValue(chart)
    const provider = new FallbackProvider([
      tier('a', { generateFlowchart: vi.fn(), repairFlowchart: firstRepair }),
      tier('b', { generateFlowchart: vi.fn(), repairFlowchart: secondRepair }),
    ])

    const result = await provider.repairFlowchart(chart, [])

    expect(result).toEqual(chart)
    expect(secondRepair).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('throws when no tier supports the operation', async () => {
    const provider = new FallbackProvider([
      tier('gen-only', { generateFlowchart: vi.fn() }),
    ])

    await expect(provider.editFlowchart(chart, request)).rejects.toThrow(
      /No model tier supports editFlowchart/,
    )
  })

  it('falls through edit to the next tier', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const firstEdit = vi.fn().mockRejectedValue(new Error('edit down'))
    const secondEdit = vi.fn().mockResolvedValue(chart)
    const provider = new FallbackProvider([
      tier('a', { generateFlowchart: vi.fn(), editFlowchart: firstEdit }),
      tier('b', { generateFlowchart: vi.fn(), editFlowchart: secondEdit }),
    ])

    const result = await provider.editFlowchart(chart, request)

    expect(result).toEqual(chart)
    expect(secondEdit).toHaveBeenCalledWith(chart, request)
    warn.mockRestore()
  })

  it('rejects an empty tier list', () => {
    expect(() => new FallbackProvider([])).toThrow(/at least one tier/)
  })

  it('skips tiers whose available() returns false', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const second = vi.fn().mockResolvedValue(chart)
    const provider = new FallbackProvider([
      {
        label: 'gemini-blocked',
        provider: { generateFlowchart: vi.fn().mockRejectedValue(new Error('should not run')) },
        available: () => false,
      },
      tier('groq', { generateFlowchart: second }),
    ])

    const result = await provider.generateFlowchart(request)

    expect(result).toEqual(chart)
    expect(second).toHaveBeenCalledTimes(1)
    const lines = log.mock.calls.map((args) => String(args[0]))
    expect(lines.some((l) => l.includes('skip gemini-blocked (rate budget unavailable)'))).toBe(true)
    warn.mockRestore()
    log.mockRestore()
  })

  it('when every available tier is gated out, throws no-tier-supports', async () => {
    const provider = new FallbackProvider([
      { label: 'a', provider: { generateFlowchart: vi.fn() }, available: () => false },
    ])

    await expect(provider.generateFlowchart(request)).rejects.toThrow(
      /No model tier supports generateFlowchart/,
    )
  })

  it('exposes tier labels in order', () => {
    const provider = new FallbackProvider([
      tier('gemini-3.5-flash-lite', { generateFlowchart: vi.fn() }),
      tier('gemini-3.1-flash-lite', { generateFlowchart: vi.fn() }),
      tier('openai/gpt-oss-120b', { generateFlowchart: vi.fn() }),
    ])
    expect(provider.labels).toEqual([
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'openai/gpt-oss-120b',
    ])
  })
})
