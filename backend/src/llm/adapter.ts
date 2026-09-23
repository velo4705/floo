/**
 * The AI seam. M3 wires Groq behind this interface; swapping to a
 * self-hosted vLLM deployment later means replacing this one module.
 */
import type { Flowchart, ValidationIssue } from '@floo/shared'

export interface FlowchartRequest {
  /** The user's plain-English description of the process. */
  prompt: string
  /** Optional supporting material: pasted SOPs, meeting notes, specs. */
  context?: string[]
}

/** A generation result with per-request metadata (e.g. secondary-model aid). */
export interface GenerateOutcome {
  flowchart: Flowchart
  /** Set when a secondary model expanded an oversimplified primary result. */
  expandedBy?: string
}

export interface FlowchartProvider {
  generateFlowchart(request: FlowchartRequest): Promise<unknown>
  /** Optional: generate while returning per-request metadata (secondary-model aid). */
  generateOutcome?(request: FlowchartRequest): Promise<GenerateOutcome>
  /** Optional repair pass: ask the model to fix a structurally invalid flowchart. */
  repairFlowchart?(flowchart: Flowchart, issues: ValidationIssue[]): Promise<unknown>
  /** Conversational editing: apply a targeted change to an existing diagram. */
  editFlowchart?(current: Flowchart, request: FlowchartRequest): Promise<unknown>
}