import { Hono } from 'hono'

import { createApp } from './app.js'
import { FallbackProvider } from './llm/fallback.js'
import { expandFlowchart, GeminiAdapter, listFlashLiteModels, orderWithPin } from './llm/gemini.js'
import { GroqAdapter } from './llm/groq.js'
import { createGenPipeline, withOversimplifyAid } from './llm/pipeline.js'
import { RateWindow, Semaphore, envInt } from './rateLimit.js'

import type { Context } from 'hono'

import type { FlowchartProvider } from './llm/adapter.js'
import type { FallbackTier } from './llm/fallback.js'
import type { PipelineProvider } from './llm/pipeline.js'

export interface BackendConfig {
  geminiApiKey?: string
  geminiModel?: string
  groqApiKey?: string
  groqModel?: string
  geminiRpm?: number
  maxConcurrentLlm?: number
  rateLimitPerMinute?: number
  dailyBudget?: number
  warn?: (message: string) => void
}

export interface BackendInfo {
  tiers: string[]
  geminiModels: string[]
  oversimplifyAidModel?: string
  geminiRpm: number
  maxConcurrentLlm: number
}

export interface Backend {
  readonly app: Hono
  readonly fatal: string | null
  init(): Promise<BackendInfo>
  describe(info: BackendInfo): string[]
}

const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b'
const MISSING_KEYS = 'Set GEMINI_API_KEY and/or GROQ_API_KEY in your environment or .env file.'
const NO_TIERS = 'No usable model tiers — set GEMINI_API_KEY and/or GROQ_API_KEY.'

async function buildGeminiTiers(
  apiKey: string,
  budget: RateWindow,
  pin: string | undefined,
  warn: (message: string) => void,
): Promise<{ tiers: FallbackTier[]; models: string[] }> {
  const toTier = (model: string): FallbackTier => ({
    label: model,
    provider: new GeminiAdapter(apiKey, model, undefined, budget),
    available: () => budget.hasCapacity(),
  })

  try {
    const listed = await listFlashLiteModels({ apiKey })
    const models = orderWithPin(listed, pin)

    if (models.length === 0) {
      warn('No *-flash-lite models available on this key — skipping Gemini tiers.')
      return { tiers: [], models: [] }
    }

    return { tiers: models.map(toTier), models }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    warn(`Could not list Gemini models (${message}) — skipping dynamic discovery.`)
    if (pin) {
      return { tiers: [toTier(pin)], models: [pin] }
    }
    return { tiers: [], models: [] }
  }
}

function unavailableApp(message: string): Hono {
  const app = new Hono()
  const health = (c: Context) => c.json({ status: 'ok' })
  app.get('/health', health)
  app.get('/api/health', health)
  app.all('*', (c) => c.json({ error: message }, 503))
  return app
}

export function createBackend(config: BackendConfig = {}): Backend {
  const warn = config.warn ?? ((message: string) => console.warn(message))

  const geminiKey = config.geminiApiKey?.trim() || undefined
  const groqKey = config.groqApiKey?.trim() || undefined
  const fatal = geminiKey || groqKey ? null : MISSING_KEYS
  const geminiRpm = config.geminiRpm ?? 8
  const maxConcurrentLlm = config.maxConcurrentLlm ?? 2
  const groqModel = config.groqModel || DEFAULT_GROQ_MODEL

  let pending: Promise<BackendInfo> | null = null
  let resolved: PipelineProvider | null = null

  async function build(): Promise<BackendInfo> {
    const tiers: FallbackTier[] = []
    const geminiBudget = new RateWindow(geminiRpm, 60_000)
    let geminiModels: string[] = []

    if (geminiKey) {
      const result = await buildGeminiTiers(
        geminiKey,
        geminiBudget,
        config.geminiModel?.trim() || undefined,
        warn,
      )
      tiers.push(...result.tiers)
      geminiModels = result.models
    } else {
      warn('GEMINI_API_KEY not set — skipping Gemini tiers.')
    }

    if (groqKey) {
      tiers.push({ label: groqModel, provider: new GroqAdapter(groqKey, groqModel) })
    } else {
      warn('GROQ_API_KEY not set — skipping Groq fallback tier.')
    }

    if (tiers.length === 0) {
      throw new Error(NO_TIERS)
    }

    const fallback = new FallbackProvider(tiers)
    const corePipeline = createGenPipeline(fallback)

    // Cap concurrent LLM work so bursts don't blow the shared Gemini RPM budget.
    // IMPORTANT: close over `corePipeline`, never a reassigned `pipeline` —
    // otherwise the wrapper calls itself and deadlocks on the gate.
    let pipeline: PipelineProvider = corePipeline
    if (maxConcurrentLlm > 0) {
      const gate = new Semaphore(maxConcurrentLlm)
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
        repairFlowchart: fallback.repairFlowchart?.bind(fallback),
      })
    }

    resolved = appProvider

    return {
      tiers: tiers.map((tier) => tier.label),
      geminiModels,
      oversimplifyAidModel: geminiKey && expandModel ? expandModel : undefined,
      geminiRpm,
      maxConcurrentLlm,
    }
  }

  function init(): Promise<BackendInfo> {
    if (!pending) {
      pending = build().catch((err: unknown) => {
        pending = null
        throw err
      })
    }
    return pending
  }

  function requireProvider(): Promise<PipelineProvider> {
    return init().then(() => {
      if (!resolved) {
        throw new Error(NO_TIERS)
      }
      return resolved
    })
  }

  const lazyProvider: FlowchartProvider = {
    generateFlowchart: (request) => requireProvider().then((p) => p.generateFlowchart(request)),
    editFlowchart: (current, request) => requireProvider().then((p) => p.editFlowchart(current, request)),
    generateOutcome: (request) =>
      requireProvider().then(async (p) => {
        if (p.generateOutcome) return p.generateOutcome(request)
        return { flowchart: await p.generateFlowchart(request) }
      }),
  }

  const app = fatal
    ? unavailableApp(fatal)
    : createApp(lazyProvider, {
        rateLimitPerMinute: config.rateLimitPerMinute,
        dailyBudget: config.dailyBudget,
      })

  function describe(info: BackendInfo): string[] {
    const lines = [
      `model chain: ${info.tiers.join(' → ')}`,
      `rate limits: ${config.rateLimitPerMinute ?? 5}/min per IP · Gemini ${info.geminiRpm} RPM · max ${info.maxConcurrentLlm} concurrent LLM calls`,
    ]
    if (info.oversimplifyAidModel) {
      lines.push(`oversimplification aid enabled (${info.oversimplifyAidModel})`)
    }
    return lines
  }

  return { app, fatal, init, describe }
}

export function backendConfigFromEnv(): BackendConfig {
  return {
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL,
    groqApiKey: process.env.GROQ_API_KEY,
    groqModel: process.env.GROQ_MODEL,
    geminiRpm: envInt('GEMINI_RPM', 8),
    maxConcurrentLlm: envInt('MAX_CONCURRENT_LLM', 2),
    rateLimitPerMinute: envInt('RATE_LIMIT_PER_MIN', 5),
    dailyBudget: envInt('DAILY_REQUEST_BUDGET', 0),
  }
}
