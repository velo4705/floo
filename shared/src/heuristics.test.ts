import { describe, expect, it } from 'vitest'

import {
  DETAILED_PROMPT_MIN_CHARS,
  DETAILED_PROMPT_MIN_NODES,
  SKELETON_MAX_NODES,
  SKELETON_MIN_CHARS,
  isLikelyOversimplified,
} from './heuristics.js'

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
    expect(isLikelyOversimplified('a'.repeat(99), 4)).toBe(false)
    expect(isLikelyOversimplified('a'.repeat(100), 4)).toBe(true)
  })

  it('uses 5 nodes as the size threshold', () => {
    expect(DETAILED_PROMPT_MIN_NODES).toBe(5)
    expect(isLikelyOversimplified('a'.repeat(120), 4)).toBe(true)
    expect(isLikelyOversimplified('a'.repeat(120), 5)).toBe(false)
  })

  it('trims surrounding whitespace before measuring length', () => {
    expect(isLikelyOversimplified(`   ${'a'.repeat(100)}   `, 3)).toBe(true)
  })

  it('flags a short architecture prompt collapsed to a 3-node skeleton', () => {
    const prompt = 'system architecture for a chat app'
    expect(prompt.length).toBeGreaterThanOrEqual(SKELETON_MIN_CHARS)
    expect(prompt.length).toBeLessThan(DETAILED_PROMPT_MIN_CHARS)
    expect(isLikelyOversimplified(prompt, SKELETON_MAX_NODES)).toBe(true)
  })

  it('uses 30 chars and 3 nodes as the skeleton thresholds', () => {
    expect(SKELETON_MIN_CHARS).toBe(30)
    expect(SKELETON_MAX_NODES).toBe(3)
    expect(isLikelyOversimplified('a'.repeat(29), 3)).toBe(false)
    expect(isLikelyOversimplified('a'.repeat(30), 3)).toBe(true)
    expect(isLikelyOversimplified('a'.repeat(30), 4)).toBe(false)
  })

  it('does not flag a trivial greeting that is legitimately 3 nodes', () => {
    expect(isLikelyOversimplified('hello', 3)).toBe(false)
    expect(isLikelyOversimplified('draw a box', 3)).toBe(false)
  })
})
