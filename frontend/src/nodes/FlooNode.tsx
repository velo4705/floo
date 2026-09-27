import { Handle, Position, type NodeProps } from '@xyflow/react'

import { PORTS, type NodeData } from '../lib/adapters'
import { useInlineLabelEditor } from '../lib/useInlineLabelEditor'

export default function FlooNode({ id, data, selected }: NodeProps) {
  const { label, kind, leftSource, leftTarget, url } = data as NodeData
  const editing = data.editing === true
  const commitLabel = data.onCommitLabel as ((id: string, label: string) => void) | undefined
  const cancelEdit = data.onCancelEdit as (() => void) | undefined
  const editor = useInlineLabelEditor({
    id,
    label,
    editing,
    commitLabel: (nodeId, next) => commitLabel?.(nodeId, next),
    cancelEdit: () => cancelEdit?.(),
  })

  // Double-click swaps the static label for a real input in place, so renaming
  // never needs a side panel. `nodrag` keeps React Flow from panning the node
  // while the caret is placed.
  const labelView = editing ? (
    <input
      ref={editor.inputRef}
      className={`floo-node__editor nodrag nopan${kind === 'text' ? ' floo-node__editor--text' : ''}`}
      value={editor.draft}
      aria-label="Node label"
      onChange={(e) => editor.setDraft(e.target.value)}
      onBlur={editor.commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          editor.commit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          editor.cancel()
        }
      }}
    />
  ) : (
    <div className="floo-label">{label}</div>
  )

  // Text boxes are free-floating annotations: no ports, so nothing can attach.
  if (kind === 'text') {
    return (
      <div className={`floo-node floo-node--text${selected ? ' is-selected' : ''}`}>
        <div className="floo-shape" />
        {labelView}
      </div>
    )
  }
  if (kind === 'media') {
    const src = typeof url === 'string' && url.length > 0 ? url : undefined
    return (
      <div className={`floo-node floo-node--media${selected ? ' is-selected' : ''}`}>
        <div className="floo-shape">
          {src ? (
            <img className="floo-media-img" src={src} alt={label} draggable={false} />
          ) : (
            <div className="floo-media-placeholder">No image</div>
          )}
        </div>
        {labelView}
      </div>
    )
  }
  // Decision exposes exactly two outlets (Yes bottom / No right) plus the top
  // inlet. Left appears only when a loop-back edge actually uses it.
  const isDecision = kind === 'decision'
  const showLeftSource = !isDecision || Boolean(leftSource)
  const showLeftTarget = !isDecision || Boolean(leftTarget)

  return (
    <div className={`floo-node floo-node--${kind}${selected ? ' is-selected' : ''}`}>
      <div className="floo-shape" />
      {labelView}
      <Handle id={PORTS.TOP} type="target" position={Position.Top} className="floo-handle" />
      <Handle id={PORTS.BOTTOM} type="source" position={Position.Bottom} className="floo-handle" />
      {/* Left is both: loop-backs enter here (target) and, when the source sits
          below its target, they also leave from here (source). React Flow keys
          source/target bounds separately, so the same id is fine on both. */}
      {showLeftSource && (
        <Handle
          id={PORTS.LEFT}
          type="source"
          position={Position.Left}
          className="floo-handle"
          isConnectableEnd={false}
        />
      )}
      {showLeftTarget && (
        <Handle
          id={PORTS.LEFT}
          type="target"
          position={Position.Left}
          className="floo-handle"
          isConnectableStart={false}
        />
      )}
      <Handle id={PORTS.RIGHT} type="source" position={Position.Right} className="floo-handle" />
    </div>
  )
}
