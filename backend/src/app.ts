import { Hono } from 'hono'

import { isFlowchart } from '@floo/shared'

import type { FlowchartProvider } from './llm/adapter.js'

export function createApp(provider: FlowchartProvider) {
  const app = new Hono()

  app.get('/health', (c) => c.json({ status: 'ok' }))

  app.post('/api/generate', async (c) => {
    const body = await c.req.json().catch(() => null)

    if (typeof body?.prompt !== 'string' || body.prompt.trim().length === 0) {
      return c.json({ error: 'prompt is required and must be a non-empty string' }, 400)
    }

    const context = Array.isArray(body.context)
      ? body.context.filter((x: unknown): x is string => typeof x === 'string')
      : undefined

    try {
      const request = { prompt: body.prompt, context }
      const started = Date.now()

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

    if (typeof body?.prompt !== 'string' || body.prompt.trim().length === 0) {
      return c.json({ error: 'prompt is required and must be a non-empty string' }, 400)
    }

    if (!isFlowchart(body?.current)) {
      return c.json({ error: 'current must be a valid flowchart object' }, 400)
    }

    if (!provider.editFlowchart) {
      return c.json({ error: 'This backend does not support editing.' }, 400)
    }

    const context = Array.isArray(body.context)
      ? body.context.filter((x: unknown): x is string => typeof x === 'string')
      : undefined

    try {
      const started = Date.now()
      const flowchart = await provider.editFlowchart(body.current, {
        prompt: body.prompt,
        context,
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