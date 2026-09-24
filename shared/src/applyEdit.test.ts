import { describe, expect, it } from 'vitest'

import { applyEdit } from './applyEdit.js'

import type { Flowchart } from './flowchart.js'

function makeFlowchart(overrides: Partial<Flowchart> = {}): Flowchart {
  return {
    nodes: [
      { id: 'n1', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
      { id: 'n2', type: 'process', label: 'Do thing', position: { x: 100, y: 250 } },
      { id: 'n3', type: 'end', label: 'End', position: { x: 200, y: 500 } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', label: 'go' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
    ...overrides,
  }
}

describe('applyEdit', () => {
  it('preserves canvas positions of nodes that survive the edit', () => {
    const next = makeFlowchart({
      nodes: makeFlowchart().nodes.map((n) => ({ ...n, position: { x: 0, y: 0 } })),
    })
    const result = applyEdit(makeFlowchart(), next)
    const byId = new Map(result.flowchart.nodes.map((n) => [n.id, n]))
    expect(byId.get('n2')?.position).toEqual({ x: 100, y: 250 })
    expect(byId.get('n3')?.position).toEqual({ x: 200, y: 500 })
  })

  it('preserves media metadata when the model omits it', () => {
    const prev = makeFlowchart({
      nodes: makeFlowchart().nodes.concat([
        {
          id: 'm1',
          type: 'media',
          label: 'Shot',
          position: { x: 40, y: 80 },
          metadata: { url: 'https://example.com/a.png' },
        },
      ]),
      edges: makeFlowchart().edges,
    })
    const next = makeFlowchart({
      nodes: makeFlowchart().nodes.concat([
        { id: 'm1', type: 'media', label: 'Shot', position: { x: 0, y: 0 } },
      ]),
      edges: makeFlowchart().edges,
    })
    const result = applyEdit(prev, next)
    const media = result.flowchart.nodes.find((n) => n.id === 'm1')
    expect(media?.metadata).toEqual({ url: 'https://example.com/a.png' })
    expect(media?.position).toEqual({ x: 40, y: 80 })
  })

  it('keeps layout positions for brand-new nodes', () => {
    const prev = makeFlowchart()
    const next = makeFlowchart({
      nodes: [
        ...makeFlowchart().nodes,
        { id: 'n9', type: 'process', label: 'New step', position: { x: 42, y: 77 } },
      ],
      edges: makeFlowchart().edges.concat([{ id: 'e9', source: 'n2', target: 'n9' }]),
    })
    const result = applyEdit(prev, next)
    const byId = new Map(result.flowchart.nodes.map((n) => [n.id, n]))
    expect(byId.get('n9')?.position).toEqual({ x: 42, y: 77 })
  })

  it('reports added, removed, and relabeled nodes', () => {
    const prev = makeFlowchart()
    const next: Flowchart = {
      nodes: [
        { id: 'n1', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
        { id: 'n2', type: 'process', label: 'Renamed step', position: { x: 0, y: 0 } },
        { id: 'n9', type: 'process', label: 'Brand new', position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e9', source: 'n2', target: 'n9' },
      ],
    }
    const result = applyEdit(prev, next)
    expect(result.changes.addedNodes).toEqual(['n9'])
    expect(result.changes.removedNodes).toEqual(['n3'])
    expect(result.changes.relabeledNodes).toEqual([
      { id: 'n2', from: 'Do thing', to: 'Renamed step' },
    ])
  })

  it('reports added and removed edges', () => {
    const prev = makeFlowchart()
    const next = makeFlowchart({
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
        { id: 'e9', source: 'n1', target: 'n3' },
      ],
    })
    const result = applyEdit(prev, next)
    expect(result.changes.addedEdges).toEqual(['e9'])
    expect(result.changes.removedEdges).toEqual([])
  })

  it('reports relabeled edges (branch label edits)', () => {
    const prev = makeFlowchart({
      edges: [{ id: 'e1', source: 'n1', target: 'n2', label: 'go' }],
    })
    const next = makeFlowchart({
      edges: [{ id: 'e1', source: 'n1', target: 'n2', label: 'start now' }],
    })
    const result = applyEdit(prev, next)
    expect(result.changes.relabeledEdges).toEqual([
      { id: 'e1', from: 'go', to: 'start now' },
    ])
  })

  it('returns a full replacement when no ids survive (no false position claims)', () => {
    const prev = makeFlowchart()
    const next = makeFlowchart({ nodes: makeFlowchart().nodes.map((n) => ({ ...n, id: `x-${n.id}` })) })
    const result = applyEdit(prev, next)
    expect(result.changes.removedNodes).toHaveLength(3)
    expect(result.changes.addedNodes).toHaveLength(3)
    // Nothing matched by old ids, so every node keeps the model's own position.
    expect(result.flowchart.nodes).toEqual(next.nodes)
  })
})