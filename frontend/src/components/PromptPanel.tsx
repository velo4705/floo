import { useState } from 'react'

import { applyEdit, validateFlowchart } from '@floo/shared'

import { isFlowchart, toFlowchart, toRfEdges, toRfNodes } from '../lib/adapters'
import { layoutFlowchart } from '../lib/layout'

import type { Dispatch, SetStateAction } from 'react'
import type { AppliedEdit } from '@floo/shared'
import type { FlooNode, FlooEdge } from '../lib/adapters'

type Mode = 'create' | 'edit'

interface PromptPanelProps {
  nodes: FlooNode[]
  setNodes: Dispatch<SetStateAction<FlooNode[]>>
  edges: FlooEdge[]
  setEdges: Dispatch<SetStateAction<FlooEdge[]>>
}

function describeChanges(changes: AppliedEdit['changes']): string[] {
  const parts: string[] = []
  if (changes.addedNodes.length > 0) parts.push(`Added ${changes.addedNodes.length} step${changes.addedNodes.length === 1 ? '' : 's'}.`)
  if (changes.removedNodes.length > 0) parts.push(`Removed ${changes.removedNodes.length} step${changes.removedNodes.length === 1 ? '' : 's'}.`)
  if (changes.relabeledNodes.length > 0) parts.push(`Renamed ${changes.relabeledNodes.length}.`)
  if (changes.addedEdges.length === 0 && changes.removedEdges.length === 0 && parts.length === 0) {
    parts.push('No structural changes.')
  }
  return parts
}

export function PromptPanel({ nodes, setNodes, edges, setEdges }: PromptPanelProps) {
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<Mode>('create')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [changes, setChanges] = useState<string[]>([])

  const hasContent = nodes.length > 0

  const generate = async () => {
    const trimmed = prompt.trim()
    if (!trimmed) return

    const useEdit = mode === 'edit' && hasContent

    setLoading(true)
    setError(null)
    setWarnings([])
    setChanges([])

    try {
      const res = await fetch(useEdit ? '/api/edit' : '/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          useEdit
            ? { prompt: trimmed, current: toFlowchart(nodes, edges) }
            : { prompt: trimmed },
        ),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }

      const data: unknown = await res.json()
      if (!isFlowchart(data)) throw new Error('The AI returned an invalid diagram.')

      const validation = validateFlowchart(data)
      setWarnings(validation.isClean ? [] : validation.warnings.map((w) => w.message))

      const laid = await layoutFlowchart(data)

      if (useEdit) {
        const applied = applyEdit(toFlowchart(nodes, edges), laid)
        setNodes(toRfNodes(applied.flowchart))
        setEdges(toRfEdges(applied.flowchart))
        setChanges(describeChanges(applied.changes))
      } else {
        setNodes(toRfNodes(laid))
        setEdges(toRfEdges(laid))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`prompt-panel${hasContent ? ' prompt-panel--compact' : ''}`}>
      <div className="prompt-panel__inner">
        <h2 className="prompt-panel__title">Describe your process</h2>
        {!hasContent && (
          <p className="prompt-panel__subtitle">
            Type a description and Floo will generate a flowchart for you.
          </p>
        )}
        {hasContent && (
          <div className="prompt-panel__tabs">
            <button
              type="button"
              className={`prompt-panel__tab${mode === 'create' ? ' is-active' : ''}`}
              onClick={() => setMode('create')}
            >
              Create
            </button>
            <button
              type="button"
              className={`prompt-panel__tab${mode === 'edit' ? ' is-active' : ''}`}
              onClick={() => setMode('edit')}
            >
              Edit diagram
            </button>
          </div>
        )}
        <div className="prompt-panel__input-row">
          <textarea
            className="prompt-panel__textarea"
            rows={hasContent ? 2 : 4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              mode === 'edit'
                ? 'What should change? e.g. Add a step to verify the email before sending the welcome email.'
                : 'e.g. A user signs up, verifies their email, then picks a plan. If they pick the free plan, send a welcome email. Otherwise, process payment first.'
            }
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void generate()
              }
            }}
          />
          <button
            type="button"
            className="prompt-panel__submit"
            onClick={() => void generate()}
            disabled={loading || !prompt.trim()}
          >
            {loading ? 'Working…' : mode === 'edit' && hasContent ? 'Apply edit' : 'Generate'}
          </button>
        </div>
        {error && <p className="prompt-panel__error">{error}</p>}
        {changes.length > 0 && (
          <p className="prompt-panel__changes">{changes.join(' ')}</p>
        )}
        {warnings.length > 0 && (
          <ul className="prompt-panel__warn">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        <p className="prompt-panel__hint">
          {mode === 'edit' && hasContent ? 'Ctrl+Enter to apply' : 'Ctrl+Enter to generate'}
        </p>
      </div>
    </div>
  )
}