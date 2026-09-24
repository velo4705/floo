import { describe, expect, it } from 'vitest'

import type { FlooEdge, FlooNode } from './adapters'
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  createHistory,
  pushStack,
  redoStacks,
  undoStacks,
  type GraphSnapshot,
} from './history'

function snap(label: string): GraphSnapshot {
  const node: FlooNode = {
    id: label,
    type: 'process',
    position: { x: 0, y: 0 },
    data: { kind: 'process', label },
  }
  const edge: FlooEdge = {
    id: `e-${label}`,
    source: label,
    target: label,
    data: {},
  }
  return { nodes: [node], edges: [edge] }
}

describe('history stacks', () => {
  it('starts empty', () => {
    const h = createHistory()
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
    expect(undoStacks(h, snap('a'))).toBeNull()
    expect(redoStacks(h, snap('a'))).toBeNull()
  })

  it('undoes a single commit', () => {
    const a = snap('a')
    const b = snap('b')
    const h = pushStack(createHistory(), a)

    const step = undoStacks(h, b)
    expect(step).not.toBeNull()
    expect(step!.present).toEqual(a)
    expect(step!.stacks.future).toEqual([b])
    expect(canUndo(step!.stacks)).toBe(false)
    expect(canRedo(step!.stacks)).toBe(true)
  })

  it('redoes after undo', () => {
    const a = snap('a')
    const b = snap('b')
    const h = pushStack(createHistory(), a)
    const undone = undoStacks(h, b)!
    const redone = redoStacks(undone.stacks, undone.present)

    expect(redone).not.toBeNull()
    expect(redone!.present).toEqual(b)
    expect(redone!.stacks.past).toEqual([a])
    expect(canRedo(redone!.stacks)).toBe(false)
    expect(canUndo(redone!.stacks)).toBe(true)
  })

  it('clears the redo branch on a new commit', () => {
    const a = snap('a')
    const b = snap('b')
    const h = pushStack(createHistory(), a)
    const undone = undoStacks(h, b)!
    // Commit while present is `a`: record `a`, discard the redo branch to `b`.
    const h2 = pushStack(undone.stacks, undone.present)

    expect(canRedo(h2)).toBe(false)
    expect(h2.past).toEqual([a])
  })

  it('caps the stack at HISTORY_LIMIT', () => {
    let h = createHistory()
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      h = pushStack(h, snap(`n${i}`))
    }
    expect(h.past.length).toBe(HISTORY_LIMIT)
    expect(h.past[0]!.nodes[0]!.id).toBe('n10')
  })

  it('does not alias snapshot arrays with later mutations of the source arrays', () => {
    const a = snap('a')
    const h = pushStack(createHistory(), a)
    a.nodes = []
    a.edges = []
    expect(h.past[0]!.nodes).toHaveLength(1)
    expect(h.past[0]!.edges).toHaveLength(1)
  })
})
