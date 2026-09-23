import { isFlowchart, isLikelyOversimplified, repairFlowchart, validateFlowchart } from '@floo/shared'

import type { Flowchart, ValidationIssue } from '@floo/shared'

import type { FlowchartProvider, FlowchartRequest, GenerateOutcome } from './adapter.js'

export interface PipelineOptions {
  /** Max number of model repair calls before giving up. Default 2. */
  maxRepairs?: number
}

/** The provider returned by the quality pipeline: both operations always succeed-or-throw. */
export interface PipelineProvider extends FlowchartProvider {
  generateFlowchart(request: FlowchartRequest): Promise<Flowchart>
  editFlowchart(current: Flowchart, request: FlowchartRequest): Promise<Flowchart>
}

/**
 * Wraps a core model call in the M4 quality loop:
 * validate → rule-repair → re-prompt to fix remaining errors.
 * Always returns the best flowchart it could produce, throwing only if the
 * model emits unparsable JSON.
 */
export async function runWithRepairLoop(
  core: () => Promise<unknown>,
  retry: (broken: Flowchart) => Promise<unknown> | null,
  options: PipelineOptions = {},
): Promise<Flowchart> {
  const maxRepairs = options.maxRepairs ?? 2
  let current = await requireFlowchart(core())

  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const issues = validateFlowchart(current)
    if (issues.isClean) {
      console.log(`[debug] repair-loop: clean on pass ${attempt} (${current.nodes.length} nodes)`)
      return current
    }

    console.log(
      `[debug] repair-loop: pass ${attempt} has ${issues.errors.length} error(s) — trying rule repairs`,
    )

    // 1. Safe rule-based repairs (drop dangling/duplicate elements, fill labels).
    const { flowchart: repaired, changed } = repairFlowchart(current)
    if (changed) {
      current = repaired
      const afterRules = validateFlowchart(current)
      if (afterRules.isClean) {
        console.log(`[debug] repair-loop: rule repairs fixed it (${current.nodes.length} nodes)`)
        return current
      }
      console.log(
        `[debug] repair-loop: rule repairs left ${afterRules.errors.length} error(s)`,
      )
    }

    // 2. Ask the model to fix what rules can't (missing starts/ends, branches).
    if (attempt >= maxRepairs) {
      console.log(
        `[debug] repair-loop: max repairs reached — returning with ${validateFlowchart(current).errors.length} error(s)`,
      )
      return current
    }
    const fix = retry(current)
    if (!fix) {
      console.log(`[debug] repair-loop: no model repair available — returning as-is`)
      return current
    }
    console.log(`[debug] repair-loop: calling model repair (attempt ${attempt + 1}/${maxRepairs}) ...`)
    current = await requireFlowchart(fix)
    console.log(`[debug] repair-loop: model repair returned ${current.nodes.length} nodes`)
  }

  return current
}

/**
 * Wraps a FlowchartProvider with the quality loop for both generation and
 * conversational editing. Edit requires the underlying provider to implement
 * editFlowchart, otherwise the returned provider throws on edit.
 */
export function createGenPipeline(provider: FlowchartProvider, options: PipelineOptions = {}): PipelineProvider {
  const retry = (broken: Flowchart): Promise<unknown> | null => {
    if (!provider.repairFlowchart) return null
    return provider.repairFlowchart(broken, errorsOf(broken))
  }

  return {
    async generateFlowchart(request: FlowchartRequest): Promise<Flowchart> {
      return runWithRepairLoop(() => provider.generateFlowchart(request), retry, options)
    },

    async editFlowchart(current: Flowchart, request: FlowchartRequest): Promise<Flowchart> {
      if (!provider.editFlowchart) throw new Error('This provider does not support editing.')
      return runWithRepairLoop(() => provider.editFlowchart!(current, request), retry, options)
    },
  }
}

export interface OversimplifyAidOptions {
  /** Ask the secondary model to expand an oversimplified primary result. */
  expand: (request: FlowchartRequest, current: Flowchart) => Promise<unknown>
  /** Label surfaced to clients via the X-Floo-Aid header, e.g. "Gemini Flash-Lite". */
  expandedBy: string
  /** Same model repair pass the primary pipeline uses, applied to the expansion. */
  repairFlowchart?: (flowchart: Flowchart, issues: ValidationIssue[]) => Promise<unknown>
  maxRepairs?: number
}

/**
 * Wraps a pipeline with a best-effort secondary-model aid: if the primary
 * result looks oversimplified for the given prompt, ask `expand` for a more
 * detailed chart and run it through the same repair loop. Accepts the
 * expansion only when it strictly has more nodes; any failure silently keeps
 * the primary result. The `generateFlowchart` method is unaffected — the aid
 * metadata is only exposed through `generateOutcome`.
 */
export function withOversimplifyAid(
  base: PipelineProvider,
  options: OversimplifyAidOptions,
): PipelineProvider {
  const retry = (broken: Flowchart): Promise<unknown> | null => {
    if (!options.repairFlowchart) return null
    return options.repairFlowchart(broken, validateFlowchart(broken).errors)
  }

  const generateOutcome = async (request: FlowchartRequest): Promise<GenerateOutcome> => {
    const flowchart = await base.generateFlowchart(request)
    if (!isLikelyOversimplified(request.prompt, flowchart.nodes.length)) {
      return { flowchart }
    }
    console.log(
      `[debug] oversimplify-aid: primary has only ${flowchart.nodes.length} nodes for a detailed prompt — expanding via ${options.expandedBy} ...`,
    )
    try {
      const expandStarted = Date.now()
      const candidate = await options.expand(request, flowchart)
      console.log(`[debug] oversimplify-aid: expand returned in ${Date.now() - expandStarted}ms`)
      if (!isFlowchart(candidate)) return { flowchart }
      const fixed = await runWithRepairLoop(() => Promise.resolve(candidate), retry, {
        maxRepairs: options.maxRepairs,
      })
      if (fixed.nodes.length > flowchart.nodes.length) {
        return { flowchart: fixed, expandedBy: options.expandedBy }
      }
    } catch (err) {
      console.warn('[oversimplify-aid] keeping primary result:', err instanceof Error ? err.message : err)
    }
    return { flowchart }
  }

  return {
    generateFlowchart: (request) => generateOutcome(request).then((o) => o.flowchart),
    generateOutcome,
    editFlowchart: (current, request) => base.editFlowchart(current, request),
  }
}

function errorsOf(flowchart: Flowchart): ValidationIssue[] {
  return validateFlowchart(flowchart).errors
}

async function requireFlowchart(promise: Promise<unknown>): Promise<Flowchart> {
  const value = await promise
  if (!isFlowchart(value)) {
    throw new Error('The model returned a flowchart that is not in the expected shape.')
  }
  return value
}