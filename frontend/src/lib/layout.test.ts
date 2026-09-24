import { describe, expect, it } from 'vitest'

import { isFlowchart } from './adapters'
import { NODE_SIZE, ZIGZAG_STAGGER, layoutFlowchart } from './layout'
import { sampleFlowchart } from './sample'

const tangled: typeof sampleFlowchart = {
  nodes: [
    { id: 'a', type: 'start', label: 'Start', position: { x: 500, y: 10 } },
    { id: 'b', type: 'process', label: 'A', position: { x: 20, y: 400 } },
    { id: 'c', type: 'decision', label: 'B?', position: { x: 600, y: 380 } },
    { id: 'd', type: 'process', label: 'C', position: { x: 300, y: 30 } },
    { id: 'e', type: 'end', label: 'End', position: { x: 800, y: 20 } },
  ],
  edges: [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'a', target: 'c' },
    { id: 'e3', source: 'b', target: 'd' },
    { id: 'e4', source: 'c', target: 'd' },
    { id: 'e5', source: 'd', target: 'e' },
  ],
}

const doWhile: typeof sampleFlowchart = {
  nodes: [
    { id: 'n1', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
    { id: 'n2', type: 'process', label: 'Poll server', position: { x: 0, y: 0 } },
    { id: 'n3', type: 'loop', label: 'Job complete?', position: { x: 0, y: 0 } },
    { id: 'n4', type: 'output', label: 'Download result', position: { x: 0, y: 0 } },
    { id: 'n5', type: 'end', label: 'End', position: { x: 0, y: 0 } },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
    { id: 'e3', source: 'n3', target: 'n2', label: 'True' },
    { id: 'e4', source: 'n3', target: 'n4', label: 'False' },
    { id: 'e5', source: 'n4', target: 'n5' },
  ],
}

describe('layoutFlowchart', () => {
  it('preserves nodes, edges and ids', async () => {
    const laid = await layoutFlowchart(tangled)
    expect(laid.nodes.map((n) => n.id).sort()).toEqual(tangled.nodes.map((n) => n.id).sort())
    expect(laid.edges).toEqual(tangled.edges)
    expect(isFlowchart(laid)).toBe(true)
  })

  it('produces finite, non-negative positions', async () => {
    const laid = await layoutFlowchart(tangled)
    for (const n of laid.nodes) {
      expect(Number.isFinite(n.position.x)).toBe(true)
      expect(Number.isFinite(n.position.y)).toBe(true)
      expect(n.position.x).toBeGreaterThanOrEqual(0)
      expect(n.position.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('lays out in reading order (parents above children in default top-down mode)', async () => {
    const laid = await layoutFlowchart(tangled)
    const y = new Map(laid.nodes.map((n) => [n.id, n.position.y]))
    expect(y.get('a')!).toBeLessThan(y.get('b')!)
    expect(y.get('a')!).toBeLessThan(y.get('c')!)
    expect(y.get('b')!).toBeLessThan(y.get('d')!)
    expect(y.get('c')!).toBeLessThan(y.get('d')!)
    expect(y.get('d')!).toBeLessThan(y.get('e')!)
  })

  it('is deterministic', async () => {
    const first = await layoutFlowchart(tangled)
    const second = await layoutFlowchart(tangled)
    expect(second.nodes.map((n) => n.position)).toEqual(first.nodes.map((n) => n.position))
  })

  it('keeps a do-while loop in top-down reading order (cycle does not collapse layers)', async () => {
    const laid = await layoutFlowchart(doWhile)
    const y = new Map(laid.nodes.map((n) => [n.id, n.position.y]))
    expect(y.get('n1')!).toBeLessThan(y.get('n2')!)
    expect(y.get('n2')!).toBeLessThan(y.get('n3')!)
    expect(y.get('n3')!).toBeLessThan(y.get('n4')!)
    expect(y.get('n4')!).toBeLessThan(y.get('n5')!)
  })

  it('zig-zags alternate layers when the chart contains a loop-back', async () => {
    const laid = await layoutFlowchart(doWhile)
    const byId = new Map(laid.nodes.map((n) => [n.id, n]))
    const center = (id: string) => {
      const n = byId.get(id)!
      return n.position.x + NODE_SIZE[n.type].width / 2
    }
    expect(center('n1')).toBe(center('n3'))
    expect(center('n3')).toBe(center('n5'))
    expect(center('n2')).toBe(center('n1') + ZIGZAG_STAGGER)
    expect(center('n4')).toBe(center('n1') + ZIGZAG_STAGGER)
    expect(ZIGZAG_STAGGER).toBeGreaterThan(0)
  })

  it('leaves charts without cycles in a straight column regardless of stagger', async () => {
    const staggered = await layoutFlowchart(sampleFlowchart, { stagger: ZIGZAG_STAGGER })
    const straight = await layoutFlowchart(sampleFlowchart, { stagger: 0 })
    expect(staggered.nodes.map((n) => n.position)).toEqual(straight.nodes.map((n) => n.position))
  })

  it('ignores dangling edges that reference missing nodes', async () => {
    const withDangling = {
      nodes: tangled.nodes,
      edges: [...tangled.edges, { id: 'ghost', source: 'a', target: 'does-not-exist' }],
    }
    const laid = await layoutFlowchart(withDangling)
    expect(laid.nodes.length).toBe(tangled.nodes.length)
  })

  it('handles the sample flowchart shape', async () => {
    const laid = await layoutFlowchart(sampleFlowchart)
    expect(laid.nodes).toHaveLength(sampleFlowchart.nodes.length)
  })

  it('keeps text boxes at their user-placed positions during auto-layout', async () => {
    const withNote: typeof sampleFlowchart = {
      nodes: [
        ...sampleFlowchart.nodes,
        { id: 'note1', type: 'text', label: 'Side note', position: { x: 900, y: 40 } },
      ],
      edges: sampleFlowchart.edges,
    }
    const laid = await layoutFlowchart(withNote)
    const note = laid.nodes.find((n) => n.id === 'note1')
    expect(note).toBeDefined()
    expect(note!.position).toEqual({ x: 900, y: 40 })
    expect(laid.nodes).toHaveLength(withNote.nodes.length)
  })

  it('keeps media nodes at their user-placed positions during auto-layout', async () => {
    const withMedia: typeof sampleFlowchart = {
      nodes: [
        ...sampleFlowchart.nodes,
        {
          id: 'shot1',
          type: 'media',
          label: 'Screenshot',
          position: { x: 1100, y: 200 },
          metadata: { url: 'https://example.com/img.png' },
        },
      ],
      edges: sampleFlowchart.edges,
    }
    const laid = await layoutFlowchart(withMedia)
    const shot = laid.nodes.find((n) => n.id === 'shot1')
    expect(shot).toBeDefined()
    expect(shot!.position).toEqual({ x: 1100, y: 200 })
    expect(shot!.metadata).toEqual({ url: 'https://example.com/img.png' })
    expect(laid.nodes).toHaveLength(withMedia.nodes.length)
  })

  it('never leaves two nodes overlapping after layout (including zig-zag)', async () => {
    // Branching + back-edge chart similar to a generated login/MFA flow:
    // triggers zig-zag, which previously split mixed-height rows and collided.
    const auth: typeof sampleFlowchart = {
      nodes: [
        { id: 'n1', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
        { id: 'n2', type: 'input', label: 'Enter credentials', position: { x: 0, y: 0 } },
        { id: 'n3', type: 'decision', label: 'Valid?', position: { x: 0, y: 0 } },
        { id: 'n4', type: 'process', label: 'Prompt for MFA', position: { x: 0, y: 0 } },
        { id: 'n5', type: 'decision', label: 'MFA success?', position: { x: 0, y: 0 } },
        { id: 'n6', type: 'decision', label: 'Account locked?', position: { x: 0, y: 0 } },
        { id: 'n7', type: 'process', label: 'Lock account', position: { x: 0, y: 0 } },
        { id: 'n8', type: 'process', label: 'Show error message', position: { x: 0, y: 0 } },
        { id: 'n9', type: 'output', label: 'Redirect to dashboard', position: { x: 0, y: 0 } },
        { id: 'n10', type: 'end', label: 'End', position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
        { id: 'e3', source: 'n3', target: 'n4', label: 'Yes' },
        { id: 'e4', source: 'n3', target: 'n8', label: 'No' },
        { id: 'e5', source: 'n4', target: 'n5' },
        { id: 'e6', source: 'n5', target: 'n9', label: 'Yes' },
        { id: 'e7', source: 'n5', target: 'n6', label: 'No' },
        { id: 'e8', source: 'n6', target: 'n7', label: 'Yes' },
        { id: 'e9', source: 'n6', target: 'n8', label: 'No' },
        { id: 'e10', source: 'n7', target: 'n2' },
        { id: 'e11', source: 'n8', target: 'n10' },
        { id: 'e12', source: 'n9', target: 'n10' },
      ],
    }

    const laid = await layoutFlowchart(auth)
    for (let i = 0; i < laid.nodes.length; i++) {
      const a = laid.nodes[i]!
      const sa = NODE_SIZE[a.type]
      for (let j = i + 1; j < laid.nodes.length; j++) {
        const b = laid.nodes[j]!
        const sb = NODE_SIZE[b.type]
        const ax2 = a.position.x + sa.width
        const ay2 = a.position.y + sa.height
        const bx2 = b.position.x + sb.width
        const by2 = b.position.y + sb.height
        const overlap = a.position.x < bx2 && b.position.x < ax2 && a.position.y < by2 && b.position.y < ay2
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false)
      }
    }
  })
})