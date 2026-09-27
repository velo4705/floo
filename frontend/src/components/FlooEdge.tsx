import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react'

import type { EdgeProps } from '@xyflow/react'

import { useInlineLabelEditor } from '../lib/useInlineLabelEditor'

export interface FlooEdgeData {
  label?: string
  editing?: boolean
  onStartEdit?: (id: string) => void
  onCommitLabel?: (id: string, label: string) => void
  onCancelEdit?: () => void
}

/**
 * Smooth-step (rounded right-angle) edge with the label lifted into the
 * EdgeLabelRenderer layer (stacked above the nodes) so a label is never
 * hidden behind a shape. Smooth-step matches the layered layout's reading
 * order far better than bezier, which bows across unrelated branches.
 *
 * Labels edit in place like node labels do: double-click the line (or the
 * label chip) to swap the chip for a real input. That needs
 * `pointer-events: all` on `.floo-edge-label`, since the renderer layer is
 * inert by default.
 */
export function FlooEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  label,
  data,
  selected,
  markerEnd,
  style,
  interactionWidth,
}: EdgeProps) {
  const edgeData = (data ?? {}) as FlooEdgeData
  const editing = edgeData.editing === true
  const labelText = typeof label === 'string' ? label : ''
  const editor = useInlineLabelEditor({
    id,
    label: labelText,
    editing,
    commitLabel: (edgeId, next) => edgeData.onCommitLabel?.(edgeId, next),
    cancelEdit: () => edgeData.onCancelEdit?.(),
  })

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={style}
        interactionWidth={interactionWidth}
      />
      {labelText || editing ? (
        <EdgeLabelRenderer>
          <div
            className={`floo-edge-label${selected ? ' is-selected' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {editing ? (
              <input
                ref={editor.inputRef}
                className="floo-edge__editor nodrag nopan"
                value={editor.draft}
                size={Math.max(8, editor.draft.length + 1)}
                placeholder="Label"
                aria-label="Connection label"
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
              <span className="floo-edge-label__text" onDoubleClick={() => edgeData.onStartEdit?.(id)}>
                {labelText}
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
