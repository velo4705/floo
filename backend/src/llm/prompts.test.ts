import { describe, expect, it } from 'vitest'

import { EDIT_PROMPT, REPAIR_PROMPT, SYSTEM_PROMPT } from './prompts.js'

const NEW_TYPE_TOKEN =
  'start|process|decision|input|output|loop|end|database|document|subprocess|manual|delay|text|media'

describe('prompt node-type wiring', () => {
  it('lists every node kind in each schema enum', () => {
    for (const prompt of [SYSTEM_PROMPT, EDIT_PROMPT, REPAIR_PROMPT]) {
      expect(prompt).toContain(NEW_TYPE_TOKEN)
    }
  })

  it('teaches the system prompt when to use each extended shape', () => {
    expect(SYSTEM_PROMPT).toMatch(/\|\s*database\s*\|/)
    expect(SYSTEM_PROMPT).toMatch(/\|\s*document\s*\|/)
    expect(SYSTEM_PROMPT).toMatch(/\|\s*subprocess\s*\|/)
    expect(SYSTEM_PROMPT).toMatch(/\|\s*manual\s*\|/)
    expect(SYSTEM_PROMPT).toMatch(/\|\s*delay\s*\|/)
    expect(SYSTEM_PROMPT).toContain('Data is stored or looked up')
    expect(SYSTEM_PROMPT).toContain('A human action outside the system')
    expect(SYSTEM_PROMPT).toContain('pauses or waits')
  })

  it('uses a database node in the architecture example', () => {
    expect(SYSTEM_PROMPT).toContain('database("Message store")')
  })
})
