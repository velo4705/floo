import { describe, expect, it } from 'vitest'

import type { Flowchart } from './flowchart.js'
import { validateFlowchart, type IssueKind } from './validate.js'

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

function kinds(result: ReturnType<typeof validateFlowchart>): IssueKind[] {
  return result.issues.map((i) => i.kind)
}

describe('validateFlowchart', () => {
  it('passes a clean linear flowchart', () => {
    const result = validateFlowchart(makeFlowchart())
    expect(result.isClean).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('flags duplicate node and edge ids', () => {
    const fc = makeFlowchart({
      nodes: [
        ...makeFlowchart().nodes,
        { id: 'n2', type: 'process', label: 'Again', position: { x: 0, y: 0 } },
      ],
      edges: [makeFlowchart().edges[0]!, makeFlowchart().edges[0]!, makeFlowchart().edges[1]!],
    })
    const result = validateFlowchart(fc)
    expect(kinds(result)).toContain('duplicate-node-id')
    expect(kinds(result)).toContain('duplicate-edge-id')
    expect(result.isClean).toBe(false)
  })

  it('flags dangling edges that reference unknown nodes', () => {
    const fc = makeFlowchart({
      edges: [{ id: 'e9', source: 'ghost', target: 'n2' }],
    })
    const result = validateFlowchart(fc)
    expect(kinds(result)).toContain('dangling-edge')
    expect(result.errors.some((i) => i.kind === 'dangling-edge' && i.id === 'e9')).toBe(true)
  })

  it('flags a missing start node', () => {
    const fc = makeFlowchart({
      nodes: makeFlowchart().nodes.filter((n) => n.type !== 'start'),
    })
    const result = validateFlowchart(fc)
    expect(kinds(result)).toContain('missing-start')
    expect(result.isClean).toBe(false)
  })

  it('flags multiple start nodes', () => {
    const fc = makeFlowchart({
      nodes: [
        ...makeFlowchart().nodes,
        { id: 'n9', type: 'start', label: 'Start 2', position: { x: 0, y: 0 } },
      ],
    })
    const result = validateFlowchart(fc)
    expect(kinds(result)).toContain('multiple-start')
  })

  it('flags a missing end node', () => {
    const fc = makeFlowchart({
      nodes: makeFlowchart().nodes.filter((n) => n.type !== 'end'),
    })
    const result = validateFlowchart(fc)
    expect(kinds(result)).toContain('missing-end')
  })

  it('flags decisions with fewer than two outgoing edges', () => {
    const fc = makeFlowchart({
      nodes: [
        { id: 'n1', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
        { id: 'd1', type: 'decision', label: 'Valid?', position: { x: 0, y: 0 } },
        { id: 'n3', type: 'end', label: 'End', position: { x: 0, y: 0 } },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'd1' }],
    })
    const result = validateFlowchart(fc)
    expect(kinds(result)).toContain('missing-branch')
  })

  it('flags decisions missing Yes/No labels', () => {
    const fc = makeFlowchart({
      nodes: [
        { id: 'n1', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
        { id: 'd1', type: 'decision', label: 'Valid?', position: { x: 0, y: 0 } },
        { id: 'a', type: 'end', label: 'A', position: { x: 0, y: 200 } },
        { id: 'b', type: 'end', label: 'B', position: { x: 200, y: 200 } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'd1' },
        { id: 'e2', source: 'd1', target: 'a', label: 'Maybe' },
        { id: 'e3', source: 'd1', target: 'b', label: 'Perhaps' },
      ],
    })
    const result = validateFlowchart(fc)
    expect(kinds(result)).toContain('unlabeled-branch')
  })

  it('accepts a decision with Yes/No labels', () => {
    const fc = makeFlowchart({
      nodes: [
        { id: 'n1', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
        { id: 'd1', type: 'decision', label: 'Valid?', position: { x: 0, y: 0 } },
        { id: 'a', type: 'end', label: 'A', position: { x: 0, y: 200 } },
        { id: 'b', type: 'end', label: 'B', position: { x: 200, y: 200 } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'd1' },
        { id: 'e2', source: 'd1', target: 'a', label: 'Yes' },
        { id: 'e3', source: 'd1', target: 'b', label: 'No' },
      ],
    })
    const result = validateFlowchart(fc)
    expect(result.errors.some((i) => i.kind === 'unlabeled-branch')).toBe(false)
  })

  it('accepts a do-while loop with True/False labels', () => {
    const fc = makeFlowchart({
      nodes: [
        { id: 'n1', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
        { id: 'p', type: 'process', label: 'Poll', position: { x: 0, y: 0 } },
        { id: 'l', type: 'loop', label: 'Done?', position: { x: 0, y: 0 } },
        { id: 'n3', type: 'end', label: 'End', position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'p' },
        { id: 'e2', source: 'p', target: 'l' },
        { id: 'e3', source: 'l', target: 'p', label: 'True' },
        { id: 'e4', source: 'l', target: 'n3', label: 'False' },
      ],
    })
    const result = validateFlowchart(fc)
    expect(result.isClean).toBe(true)
  })

  it('warns about orphaned nodes without hard-failing on warnings', () => {
    const fc = makeFlowchart({
      nodes: [
        ...makeFlowchart().nodes,
        { id: 'o', type: 'process', label: 'Lonely', position: { x: 500, y: 500 } },
      ],
    })
    const result = validateFlowchart(fc)
    expect(kinds(result)).toContain('orphan-node')
    expect(result.warnings.some((i) => i.kind === 'orphan-node' && i.id === 'o')).toBe(true)
  })

  it('warns about self-loop edges', () => {
    const fc = makeFlowchart({
      edges: [...makeFlowchart().edges, { id: 'e9', source: 'n2', target: 'n2' }],
    })
    const result = validateFlowchart(fc)
    expect(kinds(result)).toContain('self-loop')
    expect(result.isClean).toBe(true)
  })

  it('warns about blank labels', () => {
    const fc = makeFlowchart({
      nodes: [
        ...makeFlowchart().nodes,
        { id: 'o2', type: 'process', label: ' ', position: { x: 0, y: 500 } },
      ],
    })
    const result = validateFlowchart(fc)
    expect(kinds(result)).toContain('blank-label')
  })
})