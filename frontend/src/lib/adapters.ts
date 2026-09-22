import { isFlowchart, NODE_KINDS } from '@floo/shared'
import type { Flowchart, FlowchartEdge, FlowchartNode, NodeKind } from '@floo/shared'
import type { Edge as RfEdge, Node as RfNode } from '@xyflow/react'

export { isFlowchart, NODE_KINDS }

export type NodeData = Record<string, unknown> & {
  kind: NodeKind
  label: string
}

export type FlooNode = RfNode<NodeData>
export type FlooEdge = RfEdge<{ label?: string }>

export const PORTS = {
  TOP: 'top',
  BOTTOM: 'bottom',
  LEFT: 'left',
  RIGHT: 'right',
} as const
export type Port = (typeof PORTS)[keyof typeof PORTS]

export function toRfNodes(flowchart: Flowchart): FlooNode[] {
  return flowchart.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: { kind: n.type, label: n.label },
  }))
}

/** Sets a node's label in data (render + export path). */
export function setNodeLabel(nodes: FlooNode[], id: string, label: string): FlooNode[] {
  return nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n))
}

const YES_LABEL = /yes|true|approve|pass|continue|again|repeat/
const NO_LABEL = /no|false|reject|deny|fail|done|exit|stop/

export function toRfEdges(flowchart: Flowchart): FlooEdge[] {
  const loopBackIds = findLoopBackIds(flowchart)
  return flowchart.edges.map((e, index) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: branchSourceHandle(flowchart, e, index),
    targetHandle: loopBackIds.has(e.id) ? PORTS.LEFT : PORTS.TOP,
    // React Flow renders the top-level `label`; data.label round-trips via toFlowchart.
    label: e.label,
    data: { label: e.label },
  }))
}

/** Sets an edge's label on both the React Flow render prop and data (export path). */
export function setEdgeLabel(edges: FlooEdge[], id: string, label: string): FlooEdge[] {
  return edges.map((e) => (e.id === id ? { ...e, label, data: { ...e.data, label } } : e))
}

/**
 * Every shape exposes four ports (top/bottom/left/right). Branching nodes
 * (decision/loop) split their outlets: "Yes"/"True" edges exit the bottom,
 * "No"/"False" edges exit the right. Linear edges keep the bottom outlet.
 */
export function branchSourceHandle(flowchart: Flowchart, edge: FlowchartEdge, index: number): Port {
  const source = flowchart.nodes.find((n) => n.id === edge.source)
  if (!source) return PORTS.BOTTOM

  const label = (edge.label ?? '').toLowerCase()
  const prior = flowchart.edges.slice(0, index).filter((e) => e.source === edge.source).length

  if (source.type === 'decision' || source.type === 'loop') {
    if (YES_LABEL.test(label)) return PORTS.BOTTOM
    if (NO_LABEL.test(label)) return PORTS.RIGHT
    // No distinctive label — alternate by connection order.
    return prior % 2 === 0 ? PORTS.BOTTOM : PORTS.RIGHT
  }

  return PORTS.BOTTOM
}

/**
 * A loop-back is any DFS back edge — an edge pointing back to an ancestor in
 * reading order. It covers while-style returns (body → loop) and do-while
 * repeats (loop → earlier body via True), both of which must enter the target
 * from the left so they don't share the top/bottom corridor with forward edges.
 */
function findLoopBackIds(flowchart: Flowchart): Set<string> {
  const ids = new Set<string>()
  const outgoing = new Map<string, FlowchartEdge[]>()
  for (const e of flowchart.edges) {
    const list = outgoing.get(e.source) ?? []
    list.push(e)
    outgoing.set(e.source, list)
  }
  const known = new Set(flowchart.nodes.map((n) => n.id))
  const hasTarget = new Set(flowchart.edges.map((e) => e.target))
  const roots = [
    ...flowchart.nodes.filter((n) => n.type === 'start' || !hasTarget.has(n.id)).map((n) => n.id),
  ]
  if (roots.length === 0) roots.push(...known)

  const onPath = new Set<string>()
  const done = new Set<string>()
  const visit = (id: string): void => {
    if (done.has(id)) return
    onPath.add(id)
    for (const e of outgoing.get(id) ?? []) {
      if (!known.has(e.target)) continue
      if (onPath.has(e.target)) {
        ids.add(e.id)
      } else {
        visit(e.target)
      }
    }
    onPath.delete(id)
    done.add(id)
  }
  for (const root of roots) visit(root)
  for (const n of flowchart.nodes) visit(n.id)
  return ids
}

export function toFlowchart(nodes: FlooNode[], edges: FlooEdge[]): Flowchart {
  return {
    nodes: nodes.map(
      (n): FlowchartNode => ({
        id: n.id,
        type: n.data.kind,
        label: n.data.label,
        position: n.position,
      }),
    ),
    edges: edges.map(
      (e): FlowchartEdge => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.data?.label,
      }),
    ),
  }
}