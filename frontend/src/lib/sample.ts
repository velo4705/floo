import type { Flowchart } from '@floo/shared'

export const sampleFlowchart: Flowchart = {
  nodes: [
    { id: 'n1', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
    { id: 'n2', type: 'process', label: 'Visit floo.ink', position: { x: 0, y: 180 } },
    { id: 'n3', type: 'decision', label: 'Story clear?', position: { x: 0, y: 360 } },
    { id: 'n4', type: 'process', label: 'Write the flowchart', position: { x: 0, y: 540 } },
    { id: 'n5', type: 'end', label: 'End', position: { x: 300, y: 460 } },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2', label: '' },
    { id: 'e2', source: 'n2', target: 'n3', label: '' },
    { id: 'e3', source: 'n3', target: 'n4', label: 'Yes' },
    { id: 'e4', source: 'n3', target: 'n5', label: 'No' },
  ],
}