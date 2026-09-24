import type { Flowchart, FlowchartEdge, FlowchartNode } from './flowchart.js'

export interface Relabel<T> {
  id: string
  from: T
  to: T
}

export interface AppliedEdit {
  flowchart: Flowchart
  changes: {
    addedNodes: string[]
    removedNodes: string[]
    relabeledNodes: Relabel<string>[]
    addedEdges: string[]
    removedEdges: string[]
    relabeledEdges: Relabel<string | undefined>[]
  }
}

/**
 * Applies a model-produced edit to the user's current canvas state, preserving
 * manual tweaks. Nodes and edges are matched by id (the model is instructed to
 * keep ids stable); surviving nodes keep their current canvas position, so user
 * moves and re-arrangements are never stomped by a round-trip through the model.
 */
export function applyEdit(previous: Flowchart, next: Flowchart): AppliedEdit {
  const prevById = new Map(previous.nodes.map((n) => [n.id, n]))
  const nextById = new Map(next.nodes.map((n) => [n.id, n]))

  const nodes: FlowchartNode[] = next.nodes.map((n) => {
    const prev = prevById.get(n.id)
    if (!prev) return n
    return { ...n, position: prev.position, metadata: n.metadata ?? prev.metadata }
  })

  const edges: FlowchartEdge[] = next.edges

  const addedNodes = next.nodes.filter((n) => !prevById.has(n.id)).map((n) => n.id)
  const removedNodes = previous.nodes.filter((n) => !nextById.has(n.id)).map((n) => n.id)

  const relabeledNodes = next.nodes
    .filter((n) => {
      const prev = prevById.get(n.id)
      return prev && prev.label !== n.label
    })
    .map((n) => ({ id: n.id, from: prevById.get(n.id)!.label, to: n.label }))

  const prevEdgesById = new Map(previous.edges.map((e) => [e.id, e]))
  const nextEdgesById = new Map(next.edges.map((e) => [e.id, e]))

  const addedEdges = next.edges.filter((e) => !prevEdgesById.has(e.id)).map((e) => e.id)
  const removedEdges = previous.edges.filter((e) => !nextEdgesById.has(e.id)).map((e) => e.id)

  const relabeledEdges = next.edges
    .filter((e) => {
      const prev = prevEdgesById.get(e.id)
      return prev && prev.label !== e.label
    })
    .map((e) => ({ id: e.id, from: prevEdgesById.get(e.id)!.label, to: e.label }))

  return {
    flowchart: { nodes, edges },
    changes: {
      addedNodes,
      removedNodes,
      relabeledNodes,
      addedEdges,
      removedEdges,
      relabeledEdges,
    },
  }
}