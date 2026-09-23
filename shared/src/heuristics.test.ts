import { describe, expect, it } from 'vitest'

import { DETAILED_PROMPT_MIN_CHARS, DETAILED_PROMPT_MIN_NODES, isLikelyOversimplified } from './heuristics.js'

describe('isLikelyOversimplified', () => {
  it('flags a detailed prompt that produced a tiny chart', () => {
    expect(isLikelyOversimplified('a'.repeat(DETAILED_PROMPT_MIN_CHARS), 3)).toBe(true)
  })

  it('does not flag a short prompt', () => {
    expect(isLikelyOversimplified('short prompt', 3)).toBe(false)
  })

  it('does not flag a detailed prompt that produced enough nodes', () => {
    expect(isLikelyOversimplified('a'.repeat(DETAILED_PROMPT_MIN_CHARS), DETAILED_PROMPT_MIN_NODES)).toBe(false)
  })

  it('uses 100 chars as the detailed threshold', () => {
    expect(DETAILED_PROMPT_MIN_CHARS).toBe(100)
    expect(isLikelyOversimplified('a'.repeat(99), 3)).toBe(false)
    expect(isLikelyOversimplified('a'.repeat(100), 3)).toBe(true)
  })

  it('uses 5 nodes as the size threshold', () => {
    expect(DETAILED_PROMPT_MIN_NODES).toBe(5)
    expect(isLikelyOversimplified('a'.repeat(120), 4)).toBe(true)
    expect(isLikelyOversimplified('a'.repeat(120), 5)).toBe(false)
  })

  it('trims surrounding whitespace before measuring length', () => {
    expect(isLikelyOversimplified(`   ${'a'.repeat(100)}   `, 3)).toBe(true)
  })
})
