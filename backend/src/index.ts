import 'dotenv/config'
import { serve } from '@hono/node-server'

import { createApp } from './app.js'
import { FallbackProvider } from './llm/fallback.js'
import { expandFlowchart, GeminiAdapter, listFlashLiteModels, orderWithPin } from './llm/gemini.js'
import { GroqAdapter } from './llm/groq.js'
import { createGenPipeline, withOversimplifyAid } from './llm/pipeline.js'

import type { FallbackTier } from './llm/fallback.js'
import type { PipelineProvider } from './llm/pipeline.js'

async function buildGeminiTiers(apiKey: string): Promise<{ tiers: FallbackTier[]; models: string[] }> {
  const pin = process.env.GEMINI_MODEL?.trim()

  try {
    const listed = await listFlashLiteModels({ apiKey })
    const models = orderWithPin(listed, pin)

    if (models.length === 0) {
      console.warn('No *-flash-lite models available on this key — skipping Gemini tiers.')
      return { tiers: [], models: [] }
    }

    return {
      tiers: models.map((model) => ({ label: model, provider: new GeminiAdapter(apiKey, model) })),
      models,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`Could not list Gemini models (${message}) — skipping dynamic discovery.`)
    // Still honor an explicit pin so a list outage does not drop Gemini entirely.
    if (pin) {
      return {
        tiers: [{ label: pin, provider: new GeminiAdapter(apiKey, pin) }],
        models: [pin],
      }
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

  if (geminiKey) {
    const result = await buildGeminiTiers(geminiKey)
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
  const pipeline = createGenPipeline(provider)

  let appProvider: PipelineProvider = pipeline
  const expandModel = geminiModels[0]
  if (geminiKey && expandModel) {
    appProvider = withOversimplifyAid(pipeline, {
      expandedBy: 'Gemini Flash-Lite',
      expand: (request, current) =>
        expandFlowchart({ apiKey: geminiKey, model: expandModel }, request, current),
      repairFlowchart: provider.repairFlowchart?.bind(provider),
    })
  }

  const app = createApp(appProvider)
  const port = Number(process.env.PORT ?? 3001)

  serve({ fetch: app.fetch, port })

  console.log(`model chain: ${tiers.map((t) => t.label).join(' → ')}`)
  if (geminiKey && expandModel) {
    console.log(`oversimplification aid enabled (${expandModel})`)
  }
  console.log(`floo backend listening on http://localhost:${port}`)
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
