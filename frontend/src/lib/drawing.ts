import type { Drawing, DrawingPoint, NodeKind } from '@floo/shared'

import type { Rect } from './exportImage'
import type { FlooNode } from './adapters'
import { NODE_SIZE } from './layout'

export type DrawTool = 'select' | 'pen' | 'eraser'

export const DEFAULT_PEN_COLOR = '#9333ea'
export const DEFAULT_PEN_WIDTH = 5
export const PEN_SIZE_MIN = 1
export const PEN_SIZE_MAX = 20

/** Extra hit radius around a stroke, in screen pixels (scaled by zoom). */
export const HIT_TOLERANCE_PX = 6

const MAX_MARKED_IDS = 50

export function roundPoint(p: DrawingPoint): DrawingPoint {
  return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }
}

export function nodeBox(kind: NodeKind, position: DrawingPoint): Rect {
  const size = NODE_SIZE[kind] ?? NODE_SIZE.process
  return { x: position.x, y: position.y, width: size.width, height: size.height }
}

/** Stroke points in absolute canvas coordinates (anchored strokes shift with their node). */
export function absolutePoints(drawing: Drawing, nodes: FlooNode[]): DrawingPoint[] {
  if (!drawing.anchorNodeId) return drawing.points
  const anchor = nodes.find((n) => n.id === drawing.anchorNodeId)
  if (!anchor) return drawing.points
  return drawing.points.map((p) => ({
    x: p.x + anchor.position.x,
    y: p.y + anchor.position.y,
  }))
}

export function centroid(points: DrawingPoint[]): DrawingPoint {
  let x = 0
  let y = 0
  for (const p of points) {
    x += p.x
    y += p.y
  }
  const count = points.length || 1
  return { x: x / count, y: y / count }
}

/**
 * A stroke drawn mostly over one node attaches to it, so relayout/AI edits
 * move the ink with the shape. Strokes over empty canvas stay free.
 */
export function anchorForStroke(points: DrawingPoint[], nodes: FlooNode[]): string | undefined {
  if (points.length === 0) return undefined
  const c = centroid(points)
  for (const n of nodes) {
    const box = nodeBox(n.data.kind, n.position)
    if (c.x >= box.x && c.x <= box.x + box.width && c.y >= box.y && c.y <= box.y + box.height) {
      return n.id
    }
  }
  return undefined
}

function distToSegment(p: DrawingPoint, a: DrawingPoint, b: DrawingPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export function hitDrawing(
  point: DrawingPoint,
  absolute: DrawingPoint[],
  strokeWidth: number,
  tolerance: number,
): boolean {
  const reach = strokeWidth / 2 + tolerance
  if (absolute.length === 1) {
    return Math.hypot(point.x - absolute[0]!.x, point.y - absolute[0]!.y) <= reach
  }
  for (let i = 0; i < absolute.length - 1; i += 1) {
    if (distToSegment(point, absolute[i]!, absolute[i + 1]!) <= reach) return true
  }
  return false
}

/** Topmost (last drawn) stroke under the point, if any. */
export function hitTopmostStroke(
  point: DrawingPoint,
  drawings: Drawing[],
  nodes: FlooNode[],
  tolerance: number,
  skipIds?: ReadonlySet<string>,
): Drawing | null {
  for (let i = drawings.length - 1; i >= 0; i -= 1) {
    const d = drawings[i]!
    if (skipIds?.has(d.id)) continue
    if (hitDrawing(point, absolutePoints(d, nodes), d.width, tolerance)) return d
  }
  return null
}

export function strokeBBox(points: DrawingPoint[]): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

/**
 * Node ids overlapped by any stroke's bounding box — sent with edit requests
 * as "the user marked these" targeting hints.
 */
export function markedNodeIds(drawings: Drawing[], nodes: FlooNode[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  outer: for (const d of drawings) {
    const box = strokeBBox(absolutePoints(d, nodes))
    for (const n of nodes) {
      if (seen.has(n.id)) continue
      if (rectsIntersect(box, nodeBox(n.data.kind, n.position))) {
        seen.add(n.id)
        ids.push(n.id)
        if (ids.length >= MAX_MARKED_IDS) break outer
      }
    }
  }
  return ids
}

export function drawingsBounds(drawings: Drawing[], nodes: FlooNode[]): Rect | null {
  let bounds: Rect | null = null
  for (const d of drawings) {
    const box = strokeBBox(absolutePoints(d, nodes))
    bounds = bounds === null ? box : unionRect(bounds, box)
  }
  return bounds
}

export function toPathData(points: DrawingPoint[]): string {
  if (points.length === 0) return ''
  const first = points[0]!
  let data = `M ${first.x} ${first.y}`
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i]!
    data += ` L ${p.x} ${p.y}`
  }
  return data
}
