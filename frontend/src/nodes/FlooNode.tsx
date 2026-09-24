import { Handle, Position, type NodeProps } from '@xyflow/react'

import { PORTS, type NodeData } from '../lib/adapters'

export default function FlooNode({ data, selected }: NodeProps) {
  const { label, kind, leftSource, leftTarget, url } = data as NodeData
  // Text boxes are free-floating annotations: no ports, so nothing can attach.
  if (kind === 'text') {
    return (
      <div className={`floo-node floo-node--text${selected ? ' is-selected' : ''}`}>
        <div className="floo-shape" />
        <div className="floo-label">{label}</div>
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
        <div className="floo-label">{label}</div>
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
      <div className="floo-label">{label}</div>
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