import { describe, expect, it } from 'vitest'

import type { Flowchart } from './flowchart.js'
import { repairFlowchart } from './repair.js'

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

describe('repairFlowchart', () => {
  it('leaves a clean flowchart unchanged', () => {
    const fc = makeFlowchart()
    const result = repairFlowchart(fc)
    expect(result.changed).toBe(false)
    expect(result.flowchart).toEqual(fc)
    expect(result.applied).toHaveLength(0)
  })

  it('drops dangling edges', () => {
    const fc = makeFlowchart({
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
        { id: 'e9', source: 'ghost', target: 'n2' },
      ],
    })
    const result = repairFlowchart(fc)
    expect(result.changed).toBe(true)
    expect(result.flowchart.edges.map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(result.applied.some((a) => a.includes('e9'))).toBe(true)
  })

  it('dedupes duplicate nodes and edges (keeps first occurrence)', () => {
    const fc = makeFlowchart({
      nodes: [
        ...makeFlowchart().nodes,
        { id: 'n2', type: 'process', label: 'Second copy', position: { x: 0, y: 0 } },
      ],
      edges: makeFlowchart().edges.concat(makeFlowchart().edges[0]!),
    })
    const result = repairFlowchart(fc)
    expect(result.changed).toBe(true)
    expect(result.flowchart.nodes.filter((n) => n.id === 'n2')).toHaveLength(1)
    expect(result.flowchart.edges.filter((e) => e.id === 'e1')).toHaveLength(1)
  })

  it('fills blank labels with a per-kind default', () => {
    const fc = makeFlowchart({
      nodes: [
        { id: 'n1', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
        { id: 'n2', type: 'process', label: '   ', position: { x: 0, y: 0 } },
        { id: 'n3', type: 'decision', label: '', position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
      ],
    })
    const result = repairFlowchart(fc)
    const byId = new Map(result.flowchart.nodes.map((n) => [n.id, n.label]))
    expect(byId.get('n2')).toBe('Process')
    expect(byId.get('n3')).toBe('Decision?')
    expect(result.changed).toBe(true)
  })

  it('normalizes positions to the origin', () => {
    const fc = makeFlowchart({
      nodes: [
        { id: 'n1', type: 'start', label: 'Start', position: { x: 12, y: 34 } },
        { id: 'n2', type: 'process', label: 'Do thing', position: { x: 0, y: 0 } },
        { id: 'n3', type: 'end', label: 'End', position: { x: -5, y: 700 } },
      ],
    })
    const result = repairFlowchart(fc)
    expect(result.changed).toBe(true)
    expect(result.flowchart.nodes.every((n) => n.position.x === 0 && n.position.y === 0)).toBe(true)
  })
})