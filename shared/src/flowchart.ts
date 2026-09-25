export type NodeKind =
  | 'start'
  | 'process'
  | 'decision'
  | 'input'
  | 'output'
  | 'loop'
  | 'end'
  | 'database'
  | 'document'
  | 'subprocess'
  | 'manual'
  | 'delay'
  | 'text'
  | 'media'

export const NODE_KINDS: readonly NodeKind[] = [
  'start',
  'process',
  'decision',
  'input',
  'output',
  'loop',
  'end',
  'database',
  'document',
  'subprocess',
  'manual',
  'delay',
  'text',
  'media',
]

export function isFreeFloating(kind: NodeKind): boolean {
  return kind === 'text' || kind === 'media'
}

export interface FlowchartNode {
  id: string
  type: NodeKind
  label: string
  position: { x: number; y: number }
  metadata?: Record<string, unknown>
}

export interface FlowchartEdge {
  id: string
  source: string
  target: string
  label?: string
}

export interface DrawingPoint {
  x: number
  y: number
}

export interface Drawing {
  id: string
  points: DrawingPoint[]
  color: string
  width: number
  /** When set, points are relative to this node's position and follow it. */
  anchorNodeId?: string
}

export interface Flowchart {
  nodes: FlowchartNode[]
  edges: FlowchartEdge[]
  drawings?: Drawing[]
}

export function isDrawing(value: unknown): value is Drawing {
  if (typeof value !== 'object' || value === null) return false
  const d = value as Record<string, unknown>
  if (typeof d.id !== 'string' || d.id.length === 0) return false
  if (typeof d.color !== 'string' || d.color.length === 0) return false
  if (typeof d.width !== 'number' || !Number.isFinite(d.width) || d.width <= 0) return false
  if (d.anchorNodeId !== undefined && typeof d.anchorNodeId !== 'string') return false
  if (!Array.isArray(d.points) || d.points.length < 2) return false
  return d.points.every(
    (p) =>
      typeof p === 'object' &&
      p !== null &&
      typeof (p as DrawingPoint).x === 'number' &&
      Number.isFinite((p as DrawingPoint).x) &&
      typeof (p as DrawingPoint).y === 'number' &&
      Number.isFinite((p as DrawingPoint).y),
  )
}

/** Shape guard: checks the runtime shape of an unknown value without deep validation. */
export function isFlowchart(value: unknown): value is Flowchart {
  if (typeof value !== 'object' || value === null) return false
  const f = value as Record<string, unknown>
  if (!Array.isArray(f.nodes) || !Array.isArray(f.edges)) return false
  return (
    f.nodes.every(
      (n) =>
        typeof n === 'object' &&
        n !== null &&
        typeof (n as FlowchartNode).id === 'string' &&
        (NODE_KINDS as readonly string[]).includes((n as FlowchartNode).type) &&
        typeof (n as FlowchartNode).label === 'string' &&
        typeof (n as FlowchartNode).position?.x === 'number' &&
        typeof (n as FlowchartNode).position?.y === 'number',
    ) &&
    f.edges.every(
      (e) =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as FlowchartEdge).id === 'string' &&
        typeof (e as FlowchartEdge).source === 'string' &&
        typeof (e as FlowchartEdge).target === 'string',
    ) &&
    (f.drawings === undefined || (Array.isArray(f.drawings) && f.drawings.every(isDrawing)))
  )
}