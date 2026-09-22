import { useEffect, useRef } from 'react'

import type { FlooEdge, FlooNode } from '../lib/adapters'

interface EdgeInspectorProps {
  edge: FlooEdge
  nodes: FlooNode[]
  onChange: (label: string) => void
  focusToken: number
}

export function EdgeInspector({ edge, nodes, onChange, focusToken }: EdgeInspectorProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const rawLabel = edge.data?.label ?? edge.label
  const label = typeof rawLabel === 'string' ? rawLabel : ''
  const source = nodes.find((n) => n.id === edge.source)?.data.label ?? edge.source
  const target = nodes.find((n) => n.id === edge.target)?.data.label ?? edge.target

  useEffect(() => {
    if (focusToken > 0) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [focusToken])

  return (
    <div className="floo-sidebar__inspector">
      <div className="floo-sidebar__inspector-title">Connection</div>
      <div className="floo-sidebar__inspector-route">
        {source} → {target}
      </div>
      <input
        ref={inputRef}
        className="floo-sidebar__input"
        type="text"
        value={label}
        placeholder="Label (e.g. Yes)"
        aria-label="Connection label"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') inputRef.current?.blur()
        }}
      />
      <p className="floo-sidebar__inspector-hint">Double-click the line to edit · Backspace while typing edits text only</p>
    </div>
  )
}
