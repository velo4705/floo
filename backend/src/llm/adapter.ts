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

export interface FlowchartProvider {
  generateFlowchart(request: FlowchartRequest): Promise<unknown>
  /** Optional repair pass: ask the model to fix a structurally invalid flowchart. */
  repairFlowchart?(flowchart: Flowchart, issues: ValidationIssue[]): Promise<unknown>
  /** Conversational editing: apply a targeted change to an existing diagram. */
  editFlowchart?(current: Flowchart, request: FlowchartRequest): Promise<unknown>
}