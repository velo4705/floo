import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react'

import type { EdgeProps } from '@xyflow/react'

/**
 * Smooth-step (rounded right-angle) edge with the label lifted into the
 * EdgeLabelRenderer layer (stacked above the nodes) so a label is never
 * hidden behind a shape. Smooth-step matches the layered layout's reading
 * order far better than bezier, which bows across unrelated branches.
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
  markerEnd,
  style,
  interactionWidth,
}: EdgeProps) {
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
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="floo-edge-label"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
