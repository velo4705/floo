/** Fixed/sliding-window counter shared across Gemini tiers (RPM budget). */
export class RateWindow {
  private count = 0
  private windowStart: number
  private blockedUntil = 0

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.windowStart = this.now()
  }

  private roll(): void {
    const now = this.now()
    if (now >= this.windowStart + this.windowMs) {
      this.windowStart = now
      this.count = 0
    }
  }

  /** True when a slot is free (does not consume). */
  hasCapacity(): boolean {
    this.roll()
    if (this.now() < this.blockedUntil) return false
    return this.count < this.limit
  }

  /** Consume one slot when available. */
  tryConsume(): boolean {
    this.roll()
    if (this.now() < this.blockedUntil) return false
    if (this.count >= this.limit) return false
    this.count += 1
    return true
  }

  /** Block all capacity (e.g. after an upstream 429). */
  block(ms?: number): void {
    const wait = ms ?? this.windowMs
    this.blockedUntil = Math.max(this.blockedUntil, this.now() + wait)
  }

  get blocked(): boolean {
    return this.now() < this.blockedUntil
  }
}

/** Sliding-window requests-per-minute limiter keyed by client IP. */
export class IpRateLimiter {
  private hits = new Map<string, number[]>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns retry-after seconds when over the limit; otherwise records the hit. */
  check(ip: string): { ok: true; retryAfterSec: 0 } | { ok: false; retryAfterSec: number } {
    const cutoff = this.now() - this.windowMs
    const times = (this.hits.get(ip) ?? []).filter((t) => t > cutoff)

    if (times.length >= this.limit) {
      this.hits.set(ip, times)
      const oldest = times[0]!
      const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - this.now()) / 1000))
      return { ok: false, retryAfterSec }
    }

    times.push(this.now())
    this.hits.set(ip, times)
    return { ok: true, retryAfterSec: 0 }
  }
}

/** UTC-day request budget (resets at midnight UTC). */
export class DailyBudget {
  private day = ''
  private used = 0

  constructor(
    private readonly limit: number,
    private readonly now: () => number = Date.now,
  ) {}

  tryTake(): boolean {
    const day = new Date(this.now()).toISOString().slice(0, 10)
    if (day !== this.day) {
      this.day = day
      this.used = 0
    }
    if (this.used >= this.limit) return false
    this.used += 1
    return true
  }
}

/** Caps concurrent async work (protect upstream RPM under bursty clients). */
export class Semaphore {
  private active = 0
  private queue: Array<() => void> = []

  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active += 1
      return Promise.resolve()
    }
    // Handoff: release() transfers the slot — do not increment again here.
    return new Promise((resolve) => {
      this.queue.push(resolve)
    })
  }

  private release(): void {
    const next = this.queue.shift()
    if (next) {
      next()
    } else {
      this.active -= 1
    }
  }
}

export function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : fallback
}
