import { describe, expect, it } from 'vitest'

import type { Drawing, NodeKind } from '@floo/shared'

import type { FlooNode } from './adapters'
import {
  absolutePoints,
  anchorForStroke,
  centroid,
  drawingsBounds,
  hitDrawing,
  hitTopmostStroke,
  markedNodeIds,
  nodeBox,
  rectsIntersect,
  strokeBBox,
  toPathData,
  unionRect,
} from './drawing'

function makeNode(id: string, x = 0, y = 0, kind: NodeKind = 'process'): FlooNode {
  return { id, type: kind, position: { x, y }, data: { kind, label: id } }
}

function makeDrawing(id: string, points: Drawing['points'], extra: Partial<Drawing> = {}): Drawing {
  return { id, points, color: '#000', width: 4, ...extra }
}

describe('drawing geometry', () => {
  it('nodeBox uses the kind size at the node position', () => {
    expect(nodeBox('process', { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 190, height: 62 })
    expect(nodeBox('start', { x: 0, y: 0 })).toEqual({ x: 0, y: 0, width: 150, height: 50 })
    expect(nodeBox('database', { x: 0, y: 0 })).toEqual({ x: 0, y: 0, width: 190, height: 62 })
  })

  it('absolutePoints keeps free strokes and shifts anchored strokes with their node', () => {
    const nodes = [makeNode('n1', 100, 50)]
    const free = makeDrawing('d1', [{ x: 5, y: 6 }])
    expect(absolutePoints(free, nodes)).toEqual([{ x: 5, y: 6 }])

    const anchored = makeDrawing('d2', [{ x: 5, y: 6 }], { anchorNodeId: 'n1' })
    expect(absolutePoints(anchored, nodes)).toEqual([{ x: 105, y: 56 }])
  })

  it('absolutePoints falls back to raw points when the anchor node is gone', () => {
    const anchored = makeDrawing('d1', [{ x: 1, y: 2 }], { anchorNodeId: 'missing' })
    expect(absolutePoints(anchored, [])).toEqual([{ x: 1, y: 2 }])
  })

  it('centroid averages the points', () => {
    expect(centroid([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toEqual({ x: 5, y: 10 })
  })

  it('anchorForStroke attaches to the node under the centroid', () => {
    const nodes = [makeNode('n1', 0, 0), makeNode('n2', 500, 0)]
    const over = [
      { x: 20, y: 10 },
      { x: 80, y: 50 },
    ]
    expect(anchorForStroke(over, nodes)).toBe('n1')

    const offCanvas = [
      { x: 900, y: 900 },
      { x: 950, y: 950 },
    ]
    expect(anchorForStroke(offCanvas, nodes)).toBeUndefined()
  })

  it('hitDrawing detects points within stroke width plus tolerance', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]
    expect(hitDrawing({ x: 50, y: 4 }, line, 4, 6)).toBe(true)
    expect(hitDrawing({ x: 50, y: 40 }, line, 4, 6)).toBe(false)
    expect(hitDrawing({ x: 0, y: 0 }, line, 4, 6)).toBe(true)
    expect(hitDrawing({ x: 120, y: 0 }, line, 4, 6)).toBe(false)
  })

  it('hitDrawing handles a single-point stroke', () => {
    expect(hitDrawing({ x: 3, y: 4 }, [{ x: 0, y: 0 }], 2, 6)).toBe(true)
    expect(hitDrawing({ x: 30, y: 40 }, [{ x: 0, y: 0 }], 2, 6)).toBe(false)
  })

  it('hitTopmostStroke returns the last drawn stroke and honors skipIds', () => {
    const nodes: FlooNode[] = []
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ]
    const bottom = makeDrawing('d1', points)
    const top = makeDrawing('d2', points)
    const drawings = [bottom, top]

    expect(hitTopmostStroke({ x: 25, y: 0 }, drawings, nodes, 6)?.id).toBe('d2')
    expect(hitTopmostStroke({ x: 25, y: 0 }, drawings, nodes, 6, new Set(['d2']))?.id).toBe('d1')
    expect(hitTopmostStroke({ x: 999, y: 999 }, drawings, nodes, 6)).toBeNull()
  })

  it('strokeBBox and rectsIntersect compute overlap', () => {
    const box = strokeBBox([
      { x: 10, y: 20 },
      { x: 40, y: 80 },
    ])
    expect(box).toEqual({ x: 10, y: 20, width: 30, height: 60 })
    expect(rectsIntersect(box, { x: 35, y: 70, width: 10, height: 10 })).toBe(true)
    expect(rectsIntersect(box, { x: 100, y: 100, width: 10, height: 10 })).toBe(false)
  })

  it('unionRect spans both rectangles', () => {
    expect(
      unionRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 5, width: 10, height: 30 }),
    ).toEqual({ x: 0, y: 0, width: 30, height: 35 })
  })

  it('markedNodeIds lists nodes overlapped by any stroke, deduplicated', () => {
    const nodes = [makeNode('n1', 0, 0), makeNode('n2', 400, 0)]
    const stroke = makeDrawing('d1', [
      { x: 5, y: 5 },
      { x: 100, y: 50 },
    ])
    const miss = makeDrawing('d2', [
      { x: 900, y: 900 },
      { x: 950, y: 950 },
    ])
    expect(markedNodeIds([stroke, miss], nodes)).toEqual(['n1'])
    expect(markedNodeIds([stroke, stroke], nodes)).toEqual(['n1'])
    expect(markedNodeIds([], nodes)).toEqual([])
  })

  it('markedNodeIds resolves anchored strokes at the node position', () => {
    const nodes = [makeNode('n1', 200, 100)]
    const anchored = makeDrawing(
      'd1',
      [
        { x: 5, y: 5 },
        { x: 50, y: 40 },
      ],
      { anchorNodeId: 'n1' },
    )
    expect(markedNodeIds([anchored], nodes)).toEqual(['n1'])
  })

  it('drawingsBounds is null when empty and unions strokes otherwise', () => {
    expect(drawingsBounds([], [])).toBeNull()
    const a = makeDrawing('d1', [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ])
    const b = makeDrawing('d2', [
      { x: 100, y: 50 },
      { x: 120, y: 80 },
    ])
    expect(drawingsBounds([a, b], [])).toEqual({ x: 0, y: 0, width: 120, height: 80 })
  })

  it('toPathData builds an SVG path', () => {
    expect(
      toPathData([
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ]),
    ).toBe('M 1 2 L 3 4')
    expect(toPathData([])).toBe('')
  })
})
