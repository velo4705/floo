import { isFlowchart, repairFlowchart, validateFlowchart } from '@floo/shared'

import type { Flowchart, ValidationIssue } from '@floo/shared'

import type { FlowchartProvider, FlowchartRequest } from './adapter.js'

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
    if (validateFlowchart(current).isClean) return current

    // 1. Safe rule-based repairs (drop dangling/duplicate elements, fill labels).
    const { flowchart: repaired, changed } = repairFlowchart(current)
    if (changed) {
      current = repaired
      if (validateFlowchart(current).isClean) return current
    }

    // 2. Ask the model to fix what rules can't (missing starts/ends, branches).
    if (attempt >= maxRepairs) return current
    const fix = retry(current)
    if (!fix) return current
    current = await requireFlowchart(fix)
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