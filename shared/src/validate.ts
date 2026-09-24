import { isFreeFloating, type Flowchart } from './flowchart.js'

export type IssueSeverity = 'error' | 'warning'

export type IssueKind =
  | 'duplicate-node-id'
  | 'duplicate-edge-id'
  | 'dangling-edge'
  | 'missing-start'
  | 'missing-end'
  | 'multiple-start'
  | 'missing-branch'
  | 'extra-branch'
  | 'unlabeled-branch'
  | 'orphan-node'
  | 'self-loop'
  | 'blank-label'

export interface ValidationIssue {
  kind: IssueKind
  severity: IssueSeverity
  /** Node or edge id, when the issue refers to a specific element. */
  id?: string
  message: string
}

export interface ValidationResult {
  issues: ValidationIssue[]
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  isClean: boolean
}

const YES_LABEL = /yes|true|approve|pass|continue|again|repeat/
const NO_LABEL = /no|false|reject|deny|fail|done|exit|stop/

function issue(
  kind: IssueKind,
  severity: IssueSeverity,
  message: string,
  id?: string,
): ValidationIssue {
  return { kind, severity, message, ...(id ? { id } : {}) }
}

/**
 * Deep structural validation of a flowchart beyond the shape guard.
 * Errors are blocking (they warrant repair or re-prompting); warnings are
 * cosmetic/non-fatal anomalies the UI may surface but can still render.
 */
export function validateFlowchart(fc: Flowchart): ValidationResult {
  const issues: ValidationIssue[] = []

  // Duplicate node ids
  const nodeIds = new Set<string>()
  for (const n of fc.nodes) {
    if (nodeIds.has(n.id)) {
      issues.push(issue('duplicate-node-id', 'error', `Duplicate node id "${n.id}".`, n.id))
    }
    nodeIds.add(n.id)
  }

  // Duplicate edge ids
  const edgeIds = new Set<string>()
  for (const e of fc.edges) {
    if (edgeIds.has(e.id)) {
      issues.push(issue('duplicate-edge-id', 'error', `Duplicate edge id "${e.id}".`, e.id))
    }
    edgeIds.add(e.id)
  }

  const unknownNodeIds = fc.edges.filter((e) => !nodeIds.has(e.source) || !nodeIds.has(e.target))

  // Dangling edges
  for (const e of fc.edges) {
    if (!nodeIds.has(e.source)) {
      issues.push(
        issue('dangling-edge', 'error', `Edge "${e.id}" references unknown source "${e.source}".`, e.id),
      )
    }
    if (!nodeIds.has(e.target)) {
      issues.push(
        issue('dangling-edge', 'error', `Edge "${e.id}" references unknown target "${e.target}".`, e.id),
      )
    }
  }

  void unknownNodeIds

  // start/end node presence
  const starts = fc.nodes.filter((n) => n.type === 'start')
  if (starts.length === 0) {
    issues.push(issue('missing-start', 'error', 'Flowchart has no "start" node.'))
  } else if (starts.length > 1) {
    issues.push(issue('multiple-start', 'error', `Flowchart has ${starts.length} "start" nodes; expected exactly one.`))
  }

  if (!fc.nodes.some((n) => n.type === 'end')) {
    issues.push(issue('missing-end', 'error', 'Flowchart has no "end" node.'))
  }

  // Branching integrity for decisions and loops
  for (const n of fc.nodes) {
    if (n.type !== 'decision' && n.type !== 'loop') continue
    const outgoing = fc.edges.filter((e) => e.source === n.id)
    if (outgoing.length < 2) {
      issues.push(
        issue(
          'missing-branch',
          'error',
          `"${n.type}" node "${n.id}" has ${outgoing.length} outgoing edge(s); expected 2 (Yes/No or True/False).`,
          n.id,
        ),
      )
    } else if (outgoing.length > 2) {
      issues.push(
        issue('extra-branch', 'warning', `"${n.type}" node "${n.id}" has ${outgoing.length} outgoing edges; expected 2.`, n.id),
      )
    }

    const hasYes = outgoing.some((e) => YES_LABEL.test((e.label ?? '').toLowerCase()))
    const hasNo = outgoing.some((e) => NO_LABEL.test((e.label ?? '').toLowerCase()))
    if (outgoing.length >= 2 && (!hasYes || !hasNo)) {
      const expected = n.type === 'decision' ? '"Yes" and "No"' : '"True" and "False"'
      issues.push(
        issue(
          'unlabeled-branch',
          'error',
          `"${n.type}" node "${n.id}" is missing ${expected} labels on its outgoing edges.`,
          n.id,
        ),
      )
    }
  }

  // Per-node connectivity (skip already-flagged branching problems to avoid noise)
  const branchIds = new Set(
    fc.nodes.filter((n) => n.type === 'decision' || n.type === 'loop').map((n) => n.id),
  )
  for (const n of fc.nodes) {
    // Text/media are free-floating annotations — connectivity does not apply.
    if (n.type === 'start' || n.type === 'end' || isFreeFloating(n.type)) continue
    const hasIncoming = fc.edges.some((e) => e.target === n.id)
    const hasOutgoing = fc.edges.some((e) => e.source === n.id)

    if (!hasIncoming && !hasOutgoing) {
      issues.push(issue('orphan-node', 'warning', `Node "${n.id}" is disconnected (no incoming or outgoing edges).`, n.id))
      continue
    }
    if (!hasIncoming) {
      issues.push(issue('orphan-node', 'warning', `Node "${n.id}" has no incoming edge.`, n.id))
    }
    if (!hasOutgoing && !branchIds.has(n.id)) {
      issues.push(issue('orphan-node', 'warning', `Node "${n.id}" has no outgoing edge.`, n.id))
    }
  }

  // Self-loops
  for (const e of fc.edges) {
    if (e.source === e.target) {
      issues.push(issue('self-loop', 'warning', `Edge "${e.id}" connects node "${e.source}" to itself.`, e.id))
    }
  }

  // Blank labels
  for (const n of fc.nodes) {
    if (!n.label || n.label.trim().length === 0) {
      issues.push(issue('blank-label', 'warning', `Node "${n.id}" has a blank label.`, n.id))
    }
  }

  return {
    issues,
    errors: issues.filter((i) => i.severity === 'error'),
    warnings: issues.filter((i) => i.severity === 'warning'),
    isClean: issues.every((i) => i.severity !== 'error'),
  }
}