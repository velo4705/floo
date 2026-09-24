import type { FlooEdge, FlooNode } from './adapters'

/** Max undo entries retained (bounds memory on large AI diagrams). */
export const HISTORY_LIMIT = 50

export interface GraphSnapshot {
  nodes: FlooNode[]
  edges: FlooEdge[]
}

/**
 * Undo/redo stacks around a live "present" (the canvas state).
 * `past` is a stack: last item is what Undo restores next.
 * `future` is a stack: last item is what Redo restores next.
 */
export interface HistoryStacks {
  past: GraphSnapshot[]
  future: GraphSnapshot[]
}

export function createHistory(): HistoryStacks {
  return { past: [], future: [] }
}

/** Record `current` as the state to return to; any redo branch is discarded. */
export function pushStack(stacks: HistoryStacks, current: GraphSnapshot): HistoryStacks {
  return {
    past: [...stacks.past, { nodes: current.nodes, edges: current.edges }].slice(-HISTORY_LIMIT),
    future: [],
  }
}

export interface HistoryStep {
  stacks: HistoryStacks
  present: GraphSnapshot
}

/** Step back one entry. Returns null when there is nothing to undo. */
export function undoStacks(stacks: HistoryStacks, present: GraphSnapshot): HistoryStep | null {
  if (stacks.past.length === 0) return null
  const previous = stacks.past[stacks.past.length - 1]!
  return {
    stacks: {
      past: stacks.past.slice(0, -1),
      future: [...stacks.future, { nodes: present.nodes, edges: present.edges }],
    },
    present: previous,
  }
}

/** Step forward one entry. Returns null when there is nothing to redo. */
export function redoStacks(stacks: HistoryStacks, present: GraphSnapshot): HistoryStep | null {
  if (stacks.future.length === 0) return null
  const next = stacks.future[stacks.future.length - 1]!
  return {
    stacks: {
      past: [...stacks.past, { nodes: present.nodes, edges: present.edges }],
      future: stacks.future.slice(0, -1),
    },
    present: next,
  }
}

export function canUndo(stacks: HistoryStacks): boolean {
  return stacks.past.length > 0
}

export function canRedo(stacks: HistoryStacks): boolean {
  return stacks.future.length > 0
}
