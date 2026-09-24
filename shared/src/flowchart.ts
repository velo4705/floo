export type NodeKind =
  | 'start'
  | 'process'
  | 'decision'
  | 'input'
  | 'output'
  | 'loop'
  | 'end'
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

export interface Flowchart {
  nodes: FlowchartNode[]
  edges: FlowchartEdge[]
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
    )
  )
}