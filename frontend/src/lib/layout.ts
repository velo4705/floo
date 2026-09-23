import ELK from 'elkjs/lib/elk.bundled.js'

import type { Flowchart, FlowchartEdge, FlowchartNode, NodeKind } from '@floo/shared'

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
export const ZIGZAG_STAGGER = 96

export const NODE_SIZE: Record<NodeKind, { width: number; height: number }> = {
  start: { width: 150, height: 50 },
  end: { width: 150, height: 50 },
  process: { width: 190, height: 62 },
  decision: { width: 130, height: 130 },
  input: { width: 190, height: 50 },
  output: { width: 190, height: 50 },
  loop: { width: 190, height: 62 },
}

function toElkDefinition(flowchart: Flowchart, options: LayoutOptions) {
  // Top-down is the conventional flowchart reading order; pass 'LR' to override.
  const direction = options.direction === 'LR' ? 'RIGHT' : 'DOWN'
  const spacing = options.spacing ?? 64

  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': String(spacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(spacing * 2),
      'elk.layered.spacing.edgeNodeBetweenLayers': String(spacing),
      // Break cycles against model order so loop-back edges (which point
      // "upwards" in reading order) are the ones reversed, keeping the main
      // path on a clean top-down stack.
      'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      // Prefer balanced node placement / straighter orthogonal routes.
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    },
    children: flowchart.nodes.map((n) => ({
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
 */
function applyZigzag(
  nodes: FlowchartNode[],
  edges: FlowchartEdge[],
  direction: LayoutDirection,
  stagger: number,
): FlowchartNode[] {
  if (stagger <= 0) return nodes

  const flowAxis = (p: { x: number; y: number }) => (direction === 'LR' ? p.x : p.y)
  const byId = new Map(nodes.map((n) => [n.id, n]))

  const hasBackEdge = edges.some((e) => {
    const source = byId.get(e.source)
    const target = byId.get(e.target)
    return source !== undefined && target !== undefined && flowAxis(target.position) <= flowAxis(source.position)
  })
  if (!hasBackEdge) return nodes

  // ELK aligns every node in a layer on one coordinate; group by it and
  // offset the odd layers so the column snakes.
  const layers = [...new Set(nodes.map((n) => Math.round(flowAxis(n.position))))].sort((a, b) => a - b)

  return nodes.map((n) => {
    const layer = layers.indexOf(Math.round(flowAxis(n.position)))
    if (layer % 2 === 0) return n
    return direction === 'LR'
      ? { ...n, position: { x: n.position.x, y: n.position.y + stagger } }
      : { ...n, position: { x: n.position.x + stagger, y: n.position.y } }
  })
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

  const nodes = applyZigzag(laid, flowchart.edges, options.direction ?? 'TB', options.stagger ?? ZIGZAG_STAGGER)

  return { nodes, edges: flowchart.edges }
}