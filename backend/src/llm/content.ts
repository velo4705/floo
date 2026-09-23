import type { Flowchart, ValidationIssue } from '@floo/shared'

import type { FlowchartRequest } from './adapter.js'

/** User message for a fresh generation request. */
export function buildUserContent(request: FlowchartRequest): string {
  const parts: string[] = []
  parts.push(`Describe the process to convert into a flowchart:\n\n${request.prompt}`)
  if (request.context?.length) {
    parts.push(`\n\nAdditional context provided by the user:\n${request.context.join('\n---\n')}`)
  }
  return parts.join('')
}

/** User message for a structural repair pass. */
export function buildRepairContent(flowchart: Flowchart, issues: ValidationIssue[]): string {
  const list = issues.map((i) => `- [${i.severity}] ${i.message}`).join('\n')
  return [
    'Structural issues found in the flowchart below:',
    '',
    list,
    '',
    'Fix all of the issues and return the complete corrected flowchart (a single JSON object, no fences).',
    '',
    'FLOWCHART JSON:',
    JSON.stringify(flowchart, null, 2),
  ].join('\n')
}

/** User message for a conversational edit request. */
export function buildEditContent(current: Flowchart, request: FlowchartRequest): string {
  const parts = [`Change requested:\n\n${request.prompt}`]
  if (request.context?.length) {
    parts.push(`\n\nAdditional context:\n${request.context.join('\n---\n')}`)
  }
  parts.push('\n\nCURRENT FLOWCHART JSON:', JSON.stringify(current, null, 2))
  return parts.join('')
}
