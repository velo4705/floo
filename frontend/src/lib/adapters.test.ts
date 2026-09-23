import { describe, expect, it } from 'vitest'

import type { Flowchart } from '@floo/shared'

import {
  PORTS,
  branchSourceHandle,
  isFlowchart,
  leftPortUsage,
  refreshEdgePorts,
  setEdgeLabel,
  setNodeLabel,
  toFlowchart,
  toRfEdges,
  toRfNodes,
} from './adapters'
import { sampleFlowchart } from './sample'

describe('adapters', () => {
  it('converts a Flowchart into React Flow nodes and edges', () => {
    const nodes = toRfNodes(sampleFlowchart)
    const edges = toRfEdges(sampleFlowchart)

    expect(nodes).toHaveLength(sampleFlowchart.nodes.length)
    expect(nodes[0]).toMatchObject({
      id: 'n1',
      type: 'start',
      position: { x: 0, y: 0 },
      data: { kind: 'start', label: 'Start' },
    })
    expect(edges).toHaveLength(sampleFlowchart.edges.length)
    expect(edges[2]).toMatchObject({ id: 'e3', source: 'n3', target: 'n4' })
  })

  it('routes decision Yes edges from the bottom and No edges from the right', () => {
    expect(toRfEdges(sampleFlowchart)[2]).toMatchObject({
      id: 'e3',
      sourceHandle: PORTS.BOTTOM,
    })
    expect(toRfEdges(sampleFlowchart)[3]).toMatchObject({
      id: 'e4',
      sourceHandle: PORTS.RIGHT,
    })
  })

  it('gives linear edges the default top/bottom handles', () => {
    expect(toRfEdges(sampleFlowchart)[0]).toMatchObject({
      id: 'e1',
      sourceHandle: PORTS.BOTTOM,
      targetHandle: PORTS.TOP,
    })
  })

  it('exposes branch labels on the top-level React Flow label (render contract)', () => {
    const edges = toRfEdges(sampleFlowchart)
    expect(edges[2]!.label).toBe('Yes')
    expect(edges[3]!.label).toBe('No')
  })

  it('sets an edge label on both the render prop and data, leaving other edges alone', () => {
    const edges = toRfEdges(sampleFlowchart)
    const updated = setEdgeLabel(edges, 'e1', 'Maybe')
    expect(updated[0]).toMatchObject({ id: 'e1', label: 'Maybe', data: { label: 'Maybe' } })
    expect(updated[1]).toEqual(edges[1])
    expect(updated).toHaveLength(edges.length)
  })

  it('clears an edge label with an empty string', () => {
    const edges = toRfEdges(sampleFlowchart)
    const cleared = setEdgeLabel(edges, 'e3', '')
    expect(cleared[2]).toMatchObject({ id: 'e3', label: '', data: { label: '' } })
  })

  it('sets a node label in data, leaving other nodes alone', () => {
    const nodes = toRfNodes(sampleFlowchart)
    const updated = setNodeLabel(nodes, 'n2', 'Open floo.ink')
    expect(updated[1]).toMatchObject({ id: 'n2', data: { label: 'Open floo.ink', kind: 'process' } })
    expect(updated[0]).toEqual(nodes[0])
    expect(updated).toHaveLength(nodes.length)
  })

  it('alternates handles for decision edges without Yes/No labels', () => {
    const flowchart: Flowchart = {
      nodes: [
        { id: 'd1', type: 'decision', label: 'Choice?', position: { x: 0, y: 0 } },
        { id: 'a', type: 'end', label: 'A', position: { x: 0, y: 200 } },
        { id: 'b', type: 'end', label: 'B', position: { x: 200, y: 200 } },
      ],
      edges: [
        { id: 'x1', source: 'd1', target: 'a', label: '' },
        { id: 'x2', source: 'd1', target: 'b', label: '' },
      ],
    }
    expect(branchSourceHandle(flowchart, flowchart.edges[0]!, 0)).toBe(PORTS.BOTTOM)
    expect(branchSourceHandle(flowchart, flowchart.edges[1]!, 1)).toBe(PORTS.RIGHT)
  })

  it('routes loop True edges from the bottom, False edges from the right, and a single incoming edge to the top', () => {
    const flowchart: Flowchart = {
      nodes: [
        { id: 's', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
        { id: 'p', type: 'process', label: 'Poll server', position: { x: 0, y: 200 } },
        { id: 'l', type: 'loop', label: 'Job complete?', position: { x: 0, y: 400 } },
        { id: 'e', type: 'end', label: 'End', position: { x: 0, y: 600 } },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'p', label: '' },
        { id: 'e2', source: 'p', target: 'l', label: '' },
        { id: 'e3', source: 'l', target: 'p', label: 'True' },
        { id: 'e4', source: 'l', target: 'e', label: 'False' },
      ],
    }
    const edges = toRfEdges(flowchart)
    expect(edges[0]).toMatchObject({ id: 'e1', sourceHandle: PORTS.BOTTOM, targetHandle: PORTS.TOP })
    expect(edges[1]).toMatchObject({ id: 'e2', targetHandle: PORTS.TOP })
    expect(edges[2]).toMatchObject({ id: 'e3', sourceHandle: PORTS.LEFT, targetHandle: PORTS.LEFT })
    expect(edges[3]).toMatchObject({ id: 'e4', sourceHandle: PORTS.RIGHT, targetHandle: PORTS.TOP })

    const usage = leftPortUsage(edges)
    expect(usage.get('l')).toEqual({ leftSource: true, leftTarget: false })
    expect(usage.get('p')).toEqual({ leftSource: false, leftTarget: true })
    expect(usage.get('s')).toBeUndefined()
  })

  it('routes a do-while True edge back into the body from the left', () => {
    const flowchart: Flowchart = {
      nodes: [
        { id: 's', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
        { id: 'p', type: 'process', label: 'Poll server', position: { x: 0, y: 200 } },
        { id: 'l', type: 'loop', label: 'Job complete?', position: { x: 0, y: 400 } },
        { id: 'd', type: 'output', label: 'Download', position: { x: 0, y: 600 } },
        { id: 'e', type: 'end', label: 'End', position: { x: 0, y: 800 } },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'p', label: '' },
        { id: 'e2', source: 'p', target: 'l', label: '' },
        { id: 'e3', source: 'l', target: 'p', label: 'True' },
        { id: 'e4', source: 'l', target: 'd', label: 'False' },
        { id: 'e5', source: 'd', target: 'e', label: '' },
      ],
    }
    const edges = toRfEdges(flowchart)
    expect(edges[1]).toMatchObject({ id: 'e2', targetHandle: PORTS.TOP })
    expect(edges[2]).toMatchObject({ id: 'e3', sourceHandle: PORTS.LEFT, targetHandle: PORTS.LEFT })
    expect(edges[3]).toMatchObject({ id: 'e4', sourceHandle: PORTS.RIGHT, targetHandle: PORTS.TOP })
  })

  it('keeps diamond merge edges on the top port (cross edges are not loop-backs)', () => {
    const flowchart: Flowchart = {
      nodes: [
        { id: 'a', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
        { id: 'b', type: 'process', label: 'B', position: { x: 0, y: 0 } },
        { id: 'c', type: 'process', label: 'C', position: { x: 0, y: 0 } },
        { id: 'd', type: 'process', label: 'D', position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b', label: '' },
        { id: 'e2', source: 'a', target: 'c', label: '' },
        { id: 'e3', source: 'b', target: 'd', label: '' },
        { id: 'e4', source: 'c', target: 'd', label: '' },
      ],
    }
    for (const e of toRfEdges(flowchart)) {
      expect(e.targetHandle).toBe(PORTS.TOP)
    }
  })

  it('routes the loop-back return edge to the left when a loop has two incoming edges', () => {
    const flowchart: Flowchart = {
      nodes: [
        { id: 's', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
        { id: 'l', type: 'loop', label: 'More items?', position: { x: 0, y: 200 } },
        { id: 'b', type: 'process', label: 'Process item', position: { x: 200, y: 200 } },
        { id: 'e', type: 'end', label: 'End', position: { x: 0, y: 400 } },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'l', label: '' },
        { id: 'e2', source: 'l', target: 'b', label: 'True' },
        { id: 'e3', source: 'b', target: 'l', label: '' },
        { id: 'e4', source: 'l', target: 'e', label: 'False' },
      ],
    }
    const edges = toRfEdges(flowchart)
    expect(edges[0]).toMatchObject({ id: 'e1', targetHandle: PORTS.TOP })
    expect(edges[1]).toMatchObject({ id: 'e2', sourceHandle: PORTS.BOTTOM })
    expect(edges[2]).toMatchObject({ id: 'e3', targetHandle: PORTS.LEFT, sourceHandle: PORTS.BOTTOM })
    expect(edges[3]).toMatchObject({ id: 'e4', sourceHandle: PORTS.RIGHT })
  })

  it('routes a loop-back that starts below its target out of the left port', () => {
    const flowchart: Flowchart = {
      nodes: [
        { id: 'p', type: 'process', label: 'Get user input', position: { x: 0, y: 0 } },
        { id: 'l', type: 'loop', label: 'Valid?', position: { x: 200, y: 200 } },
      ],
      edges: [
        { id: 'e1', source: 'p', target: 'l', label: '' },
        { id: 'e2', source: 'l', target: 'p', label: 'True' },
      ],
    }
    const edges = toRfEdges(flowchart)
    expect(edges[0]).toMatchObject({ sourceHandle: PORTS.BOTTOM, targetHandle: PORTS.TOP })
    expect(edges[1]).toMatchObject({ sourceHandle: PORTS.LEFT, targetHandle: PORTS.LEFT })
  })

  it('refreshEdgePorts recomputes port ids from positions while preserving edge props', () => {
    const flowchart: Flowchart = {
      nodes: [
        { id: 'p', type: 'process', label: 'Get user input', position: { x: 0, y: 0 } },
        { id: 'l', type: 'loop', label: 'Valid?', position: { x: 200, y: 200 } },
      ],
      edges: [
        { id: 'e1', source: 'p', target: 'l', label: '' },
        { id: 'e2', source: 'l', target: 'p', label: 'True' },
      ],
    }
    const nodes = toRfNodes(flowchart)
    // Simulate stale ports (bottom exit) on a selected edge.
    const stale = toRfEdges(flowchart).map((e, i) =>
      i === 1 ? { ...e, sourceHandle: PORTS.BOTTOM, selected: true } : e,
    )
    const refreshed = refreshEdgePorts(nodes, stale)
    expect(refreshed[1]).toMatchObject({
      sourceHandle: PORTS.LEFT,
      targetHandle: PORTS.LEFT,
      selected: true,
      data: { label: 'True' },
    })
    expect(refreshed[0]).toEqual(stale[0])
  })

  it('round-trips back into the canonical Flowchart shape', () => {
    const nodes = toRfNodes(sampleFlowchart)
    const edges = toRfEdges(sampleFlowchart)
    const back = toFlowchart(nodes, edges)

    expect(back).toEqual(sampleFlowchart)
  })

  it('accepts a valid Flowchart and rejects junk', () => {
    expect(isFlowchart(sampleFlowchart)).toBe(true)
    expect(isFlowchart({ nodes: [], edges: [] })).toBe(true)
    expect(isFlowchart(null)).toBe(false)
    expect(isFlowchart({ nodes: 'nope', edges: [] })).toBe(false)
    expect(isFlowchart({ nodes: [{ id: 1 }], edges: [] })).toBe(false)
    expect(
      isFlowchart({ nodes: [{ id: 'x', type: 'banana', label: '', position: { x: 0, y: 0 } }], edges: [] }),
    ).toBe(false)
  })
})