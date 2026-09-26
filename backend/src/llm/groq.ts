import Groq from 'groq-sdk'

import { isFlowchart } from '../../../shared/src/index.js'
import type { Flowchart, ValidationIssue } from '@floo/shared'

import { buildEditContent, buildRepairContent, buildUserContent } from './content.js'
import { EDIT_PROMPT, REPAIR_PROMPT, SYSTEM_PROMPT } from './prompts.js'

import type { FlowchartProvider, FlowchartRequest } from './adapter.js'

export class GroqAdapter implements FlowchartProvider {
  private client: Groq
  private model: string

  constructor(apiKey: string, model = 'openai/gpt-oss-120b') {
    this.client = new Groq({ apiKey, timeout: 30_000, maxRetries: 1 })
    this.model = model
  }

  async generateFlowchart(request: FlowchartRequest): Promise<Flowchart> {
    const userContent = buildUserContent(request)

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    })

    const raw = response.choices[0]?.message?.content
    if (!raw) throw new Error('Groq returned an empty response.')

    const parsed = parseFlowchartContent(raw)

    if (!isFlowchart(parsed)) {
      throw new Error('Groq returned invalid flowchart JSON.')
    }

    return parsed
  }

  async repairFlowchart(flowchart: Flowchart, issues: ValidationIssue[]): Promise<Flowchart> {
    const userContent = buildRepairContent(flowchart, issues)

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: REPAIR_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    })

    const raw = response.choices[0]?.message?.content
    if (!raw) throw new Error('Groq returned an empty response.')

    const parsed = parseFlowchartContent(raw)

    if (!isFlowchart(parsed)) {
      throw new Error('Groq returned invalid flowchart JSON during repair.')
    }

    return parsed
  }

  async editFlowchart(current: Flowchart, request: FlowchartRequest): Promise<Flowchart> {
    const userContent = buildEditContent(current, request)

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: EDIT_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    })

    const raw = response.choices[0]?.message?.content
    if (!raw) throw new Error('Groq returned an empty response.')

    const parsed = parseFlowchartContent(raw)

    if (!isFlowchart(parsed)) {
      throw new Error('Groq returned invalid flowchart JSON during edit.')
    }

    return parsed
  }
}

/**
 * Parses flowchart JSON from model output, tolerating markdown fences,
 * reasoning preamble, or other prose around the JSON.
 */
export function parseFlowchartContent(raw: string): unknown {
  const trimmed = raw.trim()

  try {
    return JSON.parse(trimmed)
  } catch {
    // not pure JSON — try to extract it
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) {
    const candidate = fenced[1]?.trim()
    if (candidate) {
      try {
        return JSON.parse(candidate)
      } catch {
        // fall through to slice
      }
    }
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      // fall through
    }
  }

  throw new Error('Could not extract JSON from model output.')
}