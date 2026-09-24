import ELK from 'elkjs/lib/elk.bundled.js'

import { isFreeFloating, type Flowchart, type FlowchartEdge, type FlowchartNode, type NodeKind } from '@floo/shared'

const elk = new ELK()

export type LayoutDirection = 'LR' | 'TB'

export interface LayoutOptions {
  direction?: LayoutDirection
  /** Horizontal + vertical spacing between nodes, in px. */
  spacing?: number
  /** Zig-zag offset applied to alternate layers when loop-backs exist. 0 disables. */
  stagger?: number
}

/** Default horizontal offset (px) for zig-zag staggering on looped charts. */
export const ZIGZAG_STAGGER = 120

export const NODE_SIZE: Record<NodeKind, { width: number; height: number }> = {
  start: { width: 150, height: 50 },
  end: { width: 150, height: 50 },
  process: { width: 190, height: 62 },
  decision: { width: 130, height: 130 },
  input: { width: 190, height: 50 },
  output: { width: 190, height: 50 },
  loop: { width: 190, height: 62 },
  text: { width: 220, height: 80 },
  media: { width: 240, height: 180 },
}

function toElkDefinition(flowchart: Flowchart, options: LayoutOptions) {
  // Top-down is the conventional flowchart reading order; pass 'LR' to override.
  const direction = options.direction === 'LR' ? 'RIGHT' : 'DOWN'
  const spacing = options.spacing ?? 96

  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': String(spacing),
      // Extra gap between layers so Yes/No branches and labels have room.
      'elk.layered.spacing.nodeNodeBetweenLayers': String(spacing * 2),
      'elk.layered.spacing.edgeNodeBetweenLayers': String(spacing),
      // Keep parallel branch edges from hugging node borders.
      'elk.layered.spacing.edgeEdge': String(spacing / 2),
      // Break cycles against model order so loop-back edges (which point
      // "upwards" in reading order) are the ones reversed, keeping the main
      // path on a clean top-down stack.
      'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      // Prefer balanced node placement / straighter orthogonal routes.
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      // Fan out branch edges so they don't stack on one corridor.
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    },
    children: flowchart.nodes
      .filter((n) => !isFreeFloating(n.type))
      .map((n) => ({
        id: n.id,
        ...NODE_SIZE[n.type],
      })),
    edges: flowchart.edges
      .filter((e) => flowchart.nodes.some((n) => n.id === e.source) && flowchart.nodes.some((n) => n.id === e.target))
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  }
}

/**
 * Zig-zag pass: when the chart contains a loop-back (an edge pointing backward
 * in reading order), the backward edge and the forward chain share the same
 * narrow center corridor, so they overlap unless nodes are dragged apart by
 * hand. Staggering alternate layers horizontally opens a clear side channel
 * for the loop-back, so looped charts snake instead of forming one rigid line.
 * Charts without back-edges are left untouched.
 *
 * Layers are grouped by node *center* on the flow axis: ELK places mixed-height
 * nodes in one layer at slightly different top-Y values, and grouping by top-Y
 * split a single row into two stagger groups (which caused overlaps).
 * If the stagger would still collide, the original ELK positions are kept.
 */
function applyZigzag(
  nodes: FlowchartNode[],
  edges: FlowchartEdge[],
  direction: LayoutDirection,
  stagger: number,
): FlowchartNode[] {
  if (stagger <= 0) return nodes

  const size = (n: FlowchartNode) => NODE_SIZE[n.type]
  const flowAxis = (p: { x: number; y: number }) => (direction === 'LR' ? p.x : p.y)
  const flowCenter = (n: FlowchartNode) => {
    const s = size(n)
    return direction === 'LR'
      ? n.position.x + s.width / 2
      : n.position.y + s.height / 2
  }
  const byId = new Map(nodes.map((n) => [n.id, n]))

  const hasBackEdge = edges.some((e) => {
    const source = byId.get(e.source)
    const target = byId.get(e.target)
    return source !== undefined && target !== undefined && flowAxis(target.position) <= flowAxis(source.position)
  })
  if (!hasBackEdge) return nodes

  // Cluster centers into layers (ELK layer gap is ≥ spacing, well above this).
  const TOLERANCE = 24
  const sorted = [...nodes].sort((a, b) => flowCenter(a) - flowCenter(b))
  const layerOf = new Map<string, number>()
  let layer = -1
  let layerRep = Number.NEGATIVE_INFINITY
  for (const n of sorted) {
    const c = flowCenter(n)
    if (layer < 0 || c - layerRep > TOLERANCE) {
      layer += 1
      layerRep = c
    }
    layerOf.set(n.id, layer)
  }

  const staggered = nodes.map((n) => {
    if ((layerOf.get(n.id) ?? 0) % 2 === 0) return n
    return direction === 'LR'
      ? { ...n, position: { x: n.position.x, y: n.position.y + stagger } }
      : { ...n, position: { x: n.position.x + stagger, y: n.position.y } }
  })

  return boxesOverlap(staggered) ? nodes : staggered
}

/** True when any two node bounding boxes intersect (edges ignored). */
function boxesOverlap(nodes: FlowchartNode[]): boolean {
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]!
    const sa = NODE_SIZE[a.type]
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j]!
      const sb = NODE_SIZE[b.type]
      const ax2 = a.position.x + sa.width
      const ay2 = a.position.y + sa.height
      const bx2 = b.position.x + sb.width
      const by2 = b.position.y + sb.height
      if (a.position.x < bx2 && b.position.x < ax2 && a.position.y < by2 && b.position.y < ay2) {
        return true
      }
    }
  }
  return false
}

/**
 * Computes a clean layered layout for the given flowchart.
 * Pure function of its input: same flowchart + options always yields the
 * same positions, so it is safe to run repeatedly (and on AI output in M3).
 */
export async function layoutFlowchart(
  flowchart: Flowchart,
  options: LayoutOptions = {},
): Promise<Flowchart> {
  const graph = toElkDefinition(flowchart, options)
  const result = await elk.layout(graph)

  const positions = new Map<string, { x: number; y: number }>()
  for (const child of result.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 })
  }

  const laid: FlowchartNode[] = flowchart.nodes.map((n) => ({
    ...n,
    position: positions.get(n.id) ?? n.position,
  }))

  const flowNodes = laid.filter((n) => !isFreeFloating(n.type))
  const staggered = applyZigzag(flowNodes, flowchart.edges, options.direction ?? 'TB', options.stagger ?? ZIGZAG_STAGGER)
  const staggerPos = new Map(staggered.map((n) => [n.id, n.position]))
  const nodes = laid.map((n) =>
    isFreeFloating(n.type) ? n : { ...n, position: staggerPos.get(n.id) ?? n.position },
  )

  return { nodes, edges: flowchart.edges }
}