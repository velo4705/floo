import { Hono } from 'hono'

import type { Context } from 'hono'

import { isFlowchart } from '@floo/shared'

import { DailyBudget, IpRateLimiter, envInt } from './rateLimit.js'
import { parsePromptBody } from './validation.js'

import type { FlowchartProvider } from './llm/adapter.js'

export interface AppOptions {
  /** Generate/edit requests allowed per IP per minute. Default 5; 0 disables. */
  rateLimitPerMinute?: number
  /** Optional UTC-day cap across all generate/edit requests. */
  dailyBudget?: number
}

function clientIp(c: Context): string {
  const xff = c.req.header('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return c.req.header('x-real-ip') ?? 'unknown'
}

export function createApp(provider: FlowchartProvider, options: AppOptions = {}) {
  const app = new Hono()

  const ratePerMin = options.rateLimitPerMinute ?? envInt('RATE_LIMIT_PER_MIN', 5)
  const ipLimiter = ratePerMin > 0 ? new IpRateLimiter(ratePerMin, 60_000) : null

  const dailyLimit = options.dailyBudget ?? envInt('DAILY_REQUEST_BUDGET', 0)
  const daily = dailyLimit > 0 ? new DailyBudget(dailyLimit) : null

  function guard(c: Context): Response | null {
    if (ipLimiter) {
      const result = ipLimiter.check(clientIp(c))
      if (!result.ok) {
        c.header('Retry-After', String(result.retryAfterSec))
        console.warn(`[rate-limit] ${clientIp(c)} blocked for ${result.retryAfterSec}s`)
        return c.json(
          {
            error: `Rate limit exceeded. Try again in ${result.retryAfterSec}s.`,
            retryAfterSec: result.retryAfterSec,
          },
          429,
        )
      }
    }
    if (daily && !daily.tryTake()) {
      console.warn('[rate-limit] daily request budget exhausted')
      return c.json({ error: 'Daily request budget exhausted. Try again tomorrow (UTC).' }, 429)
    }
    return null
  }

  app.get('/health', (c) => c.json({ status: 'ok' }))

  app.post('/api/generate', async (c) => {
    console.log('[debug] POST /api/generate received')
    const body = await c.req.json().catch(() => null)
    const parsed = parsePromptBody(body)
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400)
    }

    const blocked = guard(c)
    if (blocked) return blocked

    try {
      const request = { prompt: parsed.prompt, context: parsed.context }
      const started = Date.now()
      console.log('[debug] POST /api/generate calling provider ...')

      let flowchart: unknown
      let expandedBy: string | undefined

      if (provider.generateOutcome) {
        const outcome = await provider.generateOutcome(request)
        flowchart = outcome.flowchart
        expandedBy = outcome.expandedBy
      } else {
        flowchart = await provider.generateFlowchart(request)
      }

      console.log(`[debug] POST /api/generate done in ${Date.now() - started}ms`)
      if (expandedBy) c.header('X-Floo-Aid', expandedBy)
      return c.json(flowchart)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error'
      return c.json({ error: message }, 502)
    }
  })

  app.post('/api/edit', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = parsePromptBody(body)
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400)
    }

    if (!isFlowchart(body?.current)) {
      return c.json({ error: 'current must be a valid flowchart object' }, 400)
    }

    if (!provider.editFlowchart) {
      return c.json({ error: 'This backend does not support editing.' }, 400)
    }

    const blocked = guard(c)
    if (blocked) return blocked

    try {
      const started = Date.now()
      const flowchart = await provider.editFlowchart(body.current, {
        prompt: parsed.prompt,
        context: parsed.context,
      })
      console.log(`[debug] POST /api/edit done in ${Date.now() - started}ms`)
      return c.json(flowchart)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error'
      return c.json({ error: message }, 502)
    }
  })

  return app
}
