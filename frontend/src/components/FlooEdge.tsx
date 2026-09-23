import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react'

import type { EdgeProps } from '@xyflow/react'

/**
 * Default bezier edge with the label lifted into the EdgeLabelRenderer layer
 * (which we stack above the nodes) so a label is never hidden behind a shape.
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
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
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
