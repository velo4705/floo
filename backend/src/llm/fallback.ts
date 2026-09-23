import type { Flowchart, ValidationIssue } from '@floo/shared'

import type { FlowchartProvider, FlowchartRequest } from './adapter.js'

export interface FallbackTier {
  provider: FlowchartProvider
  /** Human-readable label for logs, e.g. "gemini-3.5-flash-lite". */
  label: string
}

/**
 * Ordered model tiers. Each operation tries tiers in order and advances only
 * when a tier throws (hard failure: timeout, bad JSON, API error). Quality
 * issues (oversimplification) do NOT advance the chain.
 */
export class FallbackProvider implements FlowchartProvider {
  constructor(private readonly tiers: FallbackTier[]) {
    if (tiers.length === 0) {
      throw new Error('FallbackProvider requires at least one tier.')
    }
  }

  get labels(): string[] {
    return this.tiers.map((t) => t.label)
  }

  async generateFlowchart(request: FlowchartRequest): Promise<unknown> {
    return this.tryTiers(
      'generateFlowchart',
      (provider) => provider.generateFlowchart(request),
      () => true,
    )
  }

  async repairFlowchart(flowchart: Flowchart, issues: ValidationIssue[]): Promise<unknown> {
    return this.tryTiers(
      'repairFlowchart',
      (provider) => provider.repairFlowchart!(flowchart, issues),
      (provider) => Boolean(provider.repairFlowchart),
    )
  }

  async editFlowchart(current: Flowchart, request: FlowchartRequest): Promise<unknown> {
    return this.tryTiers(
      'editFlowchart',
      (provider) => provider.editFlowchart!(current, request),
      (provider) => Boolean(provider.editFlowchart),
    )
  }

  private async tryTiers<T>(
    operation: string,
    attempt: (provider: FlowchartProvider) => Promise<T>,
    supports: (provider: FlowchartProvider) => boolean,
  ): Promise<T> {
    let lastError: unknown
    let attempted = 0
    const started = Date.now()

    console.log(`[debug] ${operation}: chain = ${this.tiers.map((t) => t.label).join(' → ')}`)

    for (const tier of this.tiers) {
      if (!supports(tier.provider)) {
        console.log(`[debug] ${operation}: skip ${tier.label} (does not support ${operation})`)
        continue
      }
      attempted += 1
      const tierStarted = Date.now()
      console.log(`[debug] ${operation}: trying ${tier.label} ...`)
      try {
        const result = await attempt(tier.provider)
        console.log(
          `[debug] ${operation}: ${tier.label} OK in ${Date.now() - tierStarted}ms (total ${Date.now() - started}ms)`,
        )
        return result
      } catch (err) {
        lastError = err
        const message = err instanceof Error ? err.message : String(err)
        console.warn(
          `[fallback] ${tier.label} ${operation} failed after ${Date.now() - tierStarted}ms: ${message}`,
        )
      }
    }

    if (attempted === 0) {
      throw new Error(`No model tier supports ${operation}.`)
    }

    // Single tier attempted: preserve the original error (clearer for callers).
    if (attempted === 1) {
      throw lastError
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError)
    throw new Error(`All model tiers failed during ${operation}. Last error: ${message}`)
  }
}
