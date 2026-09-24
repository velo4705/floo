import 'dotenv/config'
import { serve } from '@hono/node-server'

import { createApp } from './app.js'
import { FallbackProvider } from './llm/fallback.js'
import { expandFlowchart, GeminiAdapter, listFlashLiteModels, orderWithPin } from './llm/gemini.js'
import { GroqAdapter } from './llm/groq.js'
import { createGenPipeline, withOversimplifyAid } from './llm/pipeline.js'
import { RateWindow, Semaphore, envInt } from './rateLimit.js'

import type { FallbackTier } from './llm/fallback.js'
import type { PipelineProvider } from './llm/pipeline.js'

async function buildGeminiTiers(
  apiKey: string,
  budget: RateWindow,
): Promise<{ tiers: FallbackTier[]; models: string[] }> {
  const pin = process.env.GEMINI_MODEL?.trim()

  const toTier = (model: string): FallbackTier => ({
    label: model,
    provider: new GeminiAdapter(apiKey, model, undefined, budget),
    available: () => budget.hasCapacity(),
  })

  try {
    const listed = await listFlashLiteModels({ apiKey })
    const models = orderWithPin(listed, pin)

    if (models.length === 0) {
      console.warn('No *-flash-lite models available on this key — skipping Gemini tiers.')
      return { tiers: [], models: [] }
    }

    return { tiers: models.map(toTier), models }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`Could not list Gemini models (${message}) — skipping dynamic discovery.`)
    // Still honor an explicit pin so a list outage does not drop Gemini entirely.
    if (pin) {
      return { tiers: [toTier(pin)], models: [pin] }
    }
    return { tiers: [], models: [] }
  }
}

async function main(): Promise<void> {
  const geminiKey = process.env.GEMINI_API_KEY
  const groqKey = process.env.GROQ_API_KEY

  if (!geminiKey && !groqKey) {
    console.error('Set GEMINI_API_KEY and/or GROQ_API_KEY in your environment or .env file.')
    process.exit(1)
  }

  const tiers: FallbackTier[] = []
  let geminiModels: string[] = []
  const geminiBudget = new RateWindow(envInt('GEMINI_RPM', 8), 60_000)

  if (geminiKey) {
    const result = await buildGeminiTiers(geminiKey, geminiBudget)
    tiers.push(...result.tiers)
    geminiModels = result.models
  } else {
    console.warn('GEMINI_API_KEY not set — skipping Gemini tiers.')
  }

  const groqModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
  if (groqKey) {
    tiers.push({ label: groqModel, provider: new GroqAdapter(groqKey, groqModel) })
  } else {
    console.warn('GROQ_API_KEY not set — skipping Groq fallback tier.')
  }

  if (tiers.length === 0) {
    console.error('No usable model tiers — set GEMINI_API_KEY and/or GROQ_API_KEY.')
    process.exit(1)
  }

  const provider = new FallbackProvider(tiers)
  const corePipeline = createGenPipeline(provider)

  // Cap concurrent LLM work so bursts don't blow the shared Gemini RPM budget.
  // IMPORTANT: close over `corePipeline`, never a reassigned `pipeline` —
  // otherwise the wrapper calls itself and deadlocks on the gate.
  const maxConcurrent = envInt('MAX_CONCURRENT_LLM', 2)
  let pipeline: PipelineProvider = corePipeline
  if (maxConcurrent > 0) {
    const gate = new Semaphore(maxConcurrent)
    pipeline = {
      generateFlowchart: (request) => gate.run(() => corePipeline.generateFlowchart(request)),
      editFlowchart: (current, request) => gate.run(() => corePipeline.editFlowchart(current, request)),
    }
  }

  let appProvider: PipelineProvider = pipeline
  const expandModel = geminiModels[0]
  if (geminiKey && expandModel) {
    appProvider = withOversimplifyAid(pipeline, {
      expandedBy: 'Gemini Flash-Lite',
      expand: (request, current) =>
        expandFlowchart(
          { apiKey: geminiKey, model: expandModel, rateLimit: geminiBudget },
          request,
          current,
        ),
      repairFlowchart: provider.repairFlowchart?.bind(provider),
    })
  }

  const app = createApp(appProvider)
  const port = Number(process.env.PORT ?? 3001)

  serve({ fetch: app.fetch, port })

  console.log(`model chain: ${tiers.map((t) => t.label).join(' → ')}`)
  console.log(
    `rate limits: ${envInt('RATE_LIMIT_PER_MIN', 5)}/min per IP · Gemini ${envInt('GEMINI_RPM', 8)} RPM · max ${maxConcurrent} concurrent LLM calls`,
  )
  if (geminiKey && expandModel) {
    console.log(`oversimplification aid enabled (${expandModel})`)
  }
  console.log(`floo backend listening on http://localhost:${port}`)
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
