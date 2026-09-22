import { useEffect, useRef } from 'react'

import type { FlooNode } from '../lib/adapters'

interface NodeInspectorProps {
  node: FlooNode
  onChange: (label: string) => void
  focusToken: number
}

export function NodeInspector({ node, onChange, focusToken }: NodeInspectorProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (focusToken > 0) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [focusToken])

  return (
    <div className="floo-sidebar__inspector">
      <div className="floo-sidebar__inspector-title">Node</div>
      <div className="floo-sidebar__inspector-route">
        {node.data.kind.charAt(0).toUpperCase() + node.data.kind.slice(1)}
      </div>
      <input
        ref={inputRef}
        className="floo-sidebar__input"
        type="text"
        value={node.data.label}
        placeholder="Label"
        aria-label="Node label"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') inputRef.current?.blur()
        }}
      />
      <p className="floo-sidebar__inspector-hint">
        Double-click the shape to edit · Backspace while typing edits text only
      </p>
    </div>
  )
}
