import { describe, expect, it } from 'vitest'

import { parseFlowchartContent } from './groq.js'

const valid = {
  nodes: [
    { id: 'n1', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
    { id: 'n2', type: 'end', label: 'End', position: { x: 0, y: 0 } },
  ],
  edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
}

describe('parseFlowchartContent', () => {
  it('parses pure JSON', () => {
    expect(parseFlowchartContent(JSON.stringify(valid))).toEqual(valid)
  })

  it('parses JSON inside a ```json fence', () => {
    const raw = '```json\n' + JSON.stringify(valid) + '\n```'
    expect(parseFlowchartContent(raw)).toEqual(valid)
  })

  it('parses JSON inside an unlabeled ``` fence', () => {
    const raw = '```\n' + JSON.stringify(valid) + '\n```'
    expect(parseFlowchartContent(raw)).toEqual(valid)
  })

  it('parses JSON after a reasoning preamble (user-reported failure case)', () => {
    const raw =
      '**Reasoning:** The user submits a form and there are two outcomes based on validity.\n\n' +
      JSON.stringify(valid)
    expect(parseFlowchartContent(raw)).toEqual(valid)
  })

  it('slices the first { to last } out of mixed prose', () => {
    const raw = 'Here is your chart: ' + JSON.stringify(valid) + ' Hope that helps!'
    expect(parseFlowchartContent(raw)).toEqual(valid)
  })

  it('throws when there is no JSON at all', () => {
    expect(() => parseFlowchartContent('just some words')).toThrow('Could not extract JSON')
  })
})