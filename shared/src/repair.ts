import type { Flowchart, NodeKind } from './flowchart.js'

export interface RepairResult {
  flowchart: Flowchart
  applied: string[]
  changed: boolean
}

const DEFAULT_LABEL: Record<NodeKind, string> = {
  start: 'Start',
  end: 'End',
  process: 'Process',
  decision: 'Decision?',
  input: 'Input',
  output: 'Output',
  loop: 'Loop',
}

/**
 * Rule-based auto-repair for safe, deterministic flaws. Never invents content:
 * it removes dangling/duplicate elements and fills cosmetic gaps. Structural
 * problems (missing start/end, broken branches) are left for re-prompting.
 */
export function repairFlowchart(fc: Flowchart): RepairResult {
  const applied: string[] = []
  const original = JSON.stringify(fc)

  const nodes = [...fc.nodes]
  const edges = [...fc.edges]

  // 1. Dedupe nodes by id (keep first occurrence).
  const seenNodeIds = new Set<string>()
  const keptNodes = nodes.filter((n) => {
    if (seenNodeIds.has(n.id)) {
      applied.push(`Removed duplicate node "${n.id}".`)
      return false
    }
    seenNodeIds.add(n.id)
    return true
  })

  // 2. Dedupe edges by id and drop edges referencing unknown nodes.
  const seenEdgeIds = new Set<string>()
  const finalEdges = edges.filter((e) => {
    if (seenEdgeIds.has(e.id)) {
      applied.push(`Removed duplicate edge "${e.id}".`)
      return false
    }
    seenEdgeIds.add(e.id)
    if (!seenNodeIds.has(e.source) || !seenNodeIds.has(e.target)) {
      applied.push(`Removed edge "${e.id}" referencing an unknown node.`)
      return false
    }
    return true
  })

  // 3. Fill blank labels and normalize positions to the layout origin.
  const finalNodes = keptNodes.map((n) => {
    let label = n.label
    if (!label || label.trim().length === 0) {
      label = DEFAULT_LABEL[n.type]
      applied.push(`Filled blank label on node "${n.id}" with "${label}".`)
    }
    const position = { x: 0, y: 0 }
    if (n.position.x !== 0 || n.position.y !== 0) {
      applied.push(`Normalized position of node "${n.id}" to the origin.`)
    }
    return { ...n, label: label.trim(), position }
  })

  const flowchart: Flowchart = { nodes: finalNodes, edges: finalEdges }

  return {
    flowchart,
    applied,
    changed: JSON.stringify(flowchart) !== original,
  }
}