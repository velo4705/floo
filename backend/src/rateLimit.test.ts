import { describe, expect, it } from 'vitest'

import { DailyBudget, IpRateLimiter, RateWindow, Semaphore } from './rateLimit.js'

describe('RateWindow', () => {
  it('allows up to the limit then refuses', () => {
    let t = 0
    const w = new RateWindow(2, 60_000, () => t)

    expect(w.tryConsume()).toBe(true)
    expect(w.tryConsume()).toBe(true)
    expect(w.tryConsume()).toBe(false)
    expect(w.hasCapacity()).toBe(false)

    t = 60_000
    expect(w.hasCapacity()).toBe(true)
    expect(w.tryConsume()).toBe(true)
  })

  it('hasCapacity does not consume', () => {
    const w = new RateWindow(1, 60_000)
    expect(w.hasCapacity()).toBe(true)
    expect(w.hasCapacity()).toBe(true)
    expect(w.tryConsume()).toBe(true)
    expect(w.hasCapacity()).toBe(false)
  })

  it('block() refuses capacity until the block expires', () => {
    let t = 0
    const w = new RateWindow(8, 60_000, () => t)
    w.block(30_000)
    expect(w.hasCapacity()).toBe(false)
    expect(w.tryConsume()).toBe(false)
    expect(w.blocked).toBe(true)

    t = 30_000
    expect(w.blocked).toBe(false)
    expect(w.hasCapacity()).toBe(true)
  })
})

describe('IpRateLimiter', () => {
  it('allows up to the limit per window then returns retry-after', () => {
    let t = 0
    const limiter = new IpRateLimiter(3, 60_000, () => t)

    expect(limiter.check('1.2.3.4')).toEqual({ ok: true, retryAfterSec: 0 })
    expect(limiter.check('1.2.3.4').ok).toBe(true)
    expect(limiter.check('1.2.3.4').ok).toBe(true)

    const blocked = limiter.check('1.2.3.4')
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0)

    // Other IPs are unaffected.
    expect(limiter.check('5.6.7.8').ok).toBe(true)

    // Window slides past the oldest hit.
    t = 60_001
    expect(limiter.check('1.2.3.4').ok).toBe(true)
  })
})

describe('DailyBudget', () => {
  it('allows up to the limit per UTC day', () => {
    let t = Date.parse('2026-09-24T12:00:00Z')
    const budget = new DailyBudget(2, () => t)

    expect(budget.tryTake()).toBe(true)
    expect(budget.tryTake()).toBe(true)
    expect(budget.tryTake()).toBe(false)

    t = Date.parse('2026-09-25T00:00:01Z')
    expect(budget.tryTake()).toBe(true)
  })
})

describe('Semaphore', () => {
  it('runs at most `max` tasks at once', async () => {
    const gate = new Semaphore(2)
    let active = 0
    let peak = 0

    const task = () =>
      gate.run(async () => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 5))
        active -= 1
      })

    await Promise.all([task(), task(), task(), task(), task()])
    expect(peak).toBe(2)
  })

  it('releases on failure', async () => {
    const gate = new Semaphore(1)
    await expect(gate.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    await expect(gate.run(() => Promise.resolve('ok'))).resolves.toBe('ok')
  })

  it('does not deadlock after repeated concurrent waves', async () => {
    const gate = new Semaphore(2)
    const wave = () =>
      Promise.all([
        gate.run(() => new Promise((r) => setTimeout(r, 2))),
        gate.run(() => new Promise((r) => setTimeout(r, 2))),
        gate.run(() => new Promise((r) => setTimeout(r, 2))),
      ])

    await wave()
    await wave()
    await wave()

    // If the semaphore leaked slots, this would hang forever.
    await expect(
      Promise.race([
        gate.run(() => Promise.resolve('ok')),
        new Promise((_, reject) => setTimeout(() => reject(new Error('deadlock')), 500)),
      ]),
    ).resolves.toBe('ok')
  })

  it('does not recurse when a wrapper closes over a reassigned binding', async () => {
    // Regression: index.ts used to do `pipeline = limited` where limited
    // called `pipeline.fn` — infinite re-entry into the gate, first request hangs.
    const gate = new Semaphore(2)
    const core = { run: async () => 'core' }
    const pipeline = {
      run: () => gate.run(() => core.run()),
    }

    await expect(
      Promise.race([
        pipeline.run(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('deadlock')), 500)),
      ]),
    ).resolves.toBe('core')
  })
})
