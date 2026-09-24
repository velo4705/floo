import { useEffect, useRef } from 'react'

import type { FlooNode } from '../lib/adapters'

interface NodeInspectorProps {
  node: FlooNode
  onChange: (label: string) => void
  onUrlChange?: (url: string) => void
  focusToken: number
}

export function NodeInspector({ node, onChange, onUrlChange, focusToken }: NodeInspectorProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isMedia = node.data.kind === 'media'
  const url = typeof node.data.url === 'string' ? node.data.url : ''

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
      {isMedia && (
        <>
          <input
            className="floo-sidebar__input floo-sidebar__input--gap"
            type="url"
            value={url}
            placeholder="Image URL"
            aria-label="Media image URL"
            onChange={(e) => onUrlChange?.(e.target.value)}
          />
          <label className="floo-sidebar__btn floo-sidebar__input--gap">
            Upload image
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  const reader = new FileReader()
                  reader.onload = () => onUrlChange?.(String(reader.result ?? ''))
                  reader.readAsDataURL(file)
                }
                e.target.value = ''
              }}
            />
          </label>
        </>
      )}
      <p className="floo-sidebar__inspector-hint">
        {isMedia
          ? 'Paste an image URL or upload a file · free-floating (no connections)'
          : 'Double-click the shape to edit · Backspace while typing edits text only'}
      </p>
    </div>
  )
}
