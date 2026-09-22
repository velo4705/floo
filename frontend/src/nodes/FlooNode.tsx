import { Handle, Position, type NodeProps } from '@xyflow/react'

import { PORTS, type NodeData } from '../lib/adapters'

export default function FlooNode({ data, selected }: NodeProps) {
  const { label, kind } = data as NodeData

  return (
    <div className={`floo-node floo-node--${kind}${selected ? ' is-selected' : ''}`}>
      <div className="floo-shape" />
      <div className="floo-label">{label}</div>
      <Handle id={PORTS.TOP} type="target" position={Position.Top} className="floo-handle" />
      <Handle id={PORTS.BOTTOM} type="source" position={Position.Bottom} className="floo-handle" />
      <Handle id={PORTS.LEFT} type="target" position={Position.Left} className="floo-handle" />
      <Handle id={PORTS.RIGHT} type="source" position={Position.Right} className="floo-handle" />
    </div>
  )
}