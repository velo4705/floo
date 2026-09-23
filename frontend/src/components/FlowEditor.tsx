import { useCallback, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type OnSelectionChangeParams,
} from '@xyflow/react'
import type { NodeKind } from '@floo/shared'

import '@xyflow/react/dist/style.css'

import { isFlowchart, leftPortUsage, NODE_KINDS, refreshEdgePorts, setEdgeLabel, setNodeLabel, toFlowchart, toRfEdges, toRfNodes } from '../lib/adapters'
import { createId, defaultLabel } from '../lib/ids'
import { sampleFlowchart } from '../lib/sample'
import FlooNode from '../nodes/FlooNode'
import { EdgeInspector } from './EdgeInspector'
import { FlooEdge } from './FlooEdge'
import { NodeInspector } from './NodeInspector'
import { Palette } from './Palette'
import { PromptPanel } from './PromptPanel'
import './FlowEditor.css'

const nodeTypes = {
  start: FlooNode,
  process: FlooNode,
  decision: FlooNode,
  input: FlooNode,
  output: FlooNode,
  loop: FlooNode,
  end: FlooNode,
}

const edgeTypes = {
  default: FlooEdge,
}

const DND_MIME = 'application/floo'

function isNodeKind(value: unknown): value is NodeKind {
  return (NODE_KINDS as readonly string[]).includes(value as string)
}

function FlowEditorInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState(toRfNodes(sampleFlowchart))
  const [edges, setEdges, onEdgesChange] = useEdgesState(toRfEdges(sampleFlowchart))
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [labelFocusToken, setLabelFocusToken] = useState(0)
  const { screenToFlowPosition } = useReactFlow()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [layingOut, setLayingOut] = useState(false)

  const selectedEdge = selectedEdgeId ? (edges.find((e) => e.id === selectedEdgeId) ?? null) : null
  const selectedNode = selectedNodeId ? (nodes.find((n) => n.id === selectedNodeId) ?? null) : null

  // Re-derive port ids from live positions on every change (preserving
  // selection/data), so loop-back geometry tracks node drags and applies to
  // charts created before a routing rule changed — not just at import time.
  const renderEdges = useMemo(() => refreshEdgePorts(nodes, edges), [nodes, edges])

  // Decorate nodes with left-port usage so decisions can omit unused left handles.
  const renderNodes = useMemo(() => {
    const usage = leftPortUsage(renderEdges)
    return nodes.map((node) => {
      const flags = usage.get(node.id)
      const leftSource = Boolean(flags?.leftSource)
      const leftTarget = Boolean(flags?.leftTarget)
      if (node.data.leftSource === leftSource && node.data.leftTarget === leftTarget) return node
      return { ...node, data: { ...node.data, leftSource, leftTarget } }
    })
  }, [nodes, renderEdges])

  const onSelectionChange = useCallback((selection: OnSelectionChangeParams) => {
    setSelectedEdgeId(
      selection.nodes.length === 0 && selection.edges.length === 1 ? selection.edges[0]!.id : null,
    )
    setSelectedNodeId(
      selection.edges.length === 0 && selection.nodes.length === 1 ? selection.nodes[0]!.id : null,
    )
  }, [])

  const onLabelEditShortcut = useCallback(() => {
    setLabelFocusToken((t) => t + 1)
  }, [])

  const onEdgeLabelChange = useCallback(
    (label: string) => {
      if (!selectedEdgeId) return
      setEdges((eds) => setEdgeLabel(eds, selectedEdgeId, label))
    },
    [selectedEdgeId, setEdges],
  )

  const onNodeLabelChange = useCallback(
    (label: string) => {
      if (!selectedNodeId) return
      setNodes((nds) => setNodeLabel(nds, selectedNodeId, label))
    },
    [selectedNodeId, setNodes],
  )

  const onAutoLayout = useCallback(async () => {
    setLayingOut(true)
    try {
      const { layoutFlowchart } = await import('../lib/layout')
      const laid = await layoutFlowchart(toFlowchart(nodes, edges))
      setNodes(toRfNodes(laid))
      setEdges(toRfEdges(laid))
    } finally {
      setLayingOut(false)
    }
  }, [nodes, edges, setNodes, setEdges])

  const addNode = useCallback(
    (kind: NodeKind, position: { x: number; y: number }) => {
      setNodes((nds) =>
        nds.concat({
          id: createId(),
          type: kind,
          position,
          data: { kind, label: defaultLabel(kind) },
        }),
      )
    },
    [setNodes],
  )

  const onPaletteAdd = useCallback(
    (kind: NodeKind) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      addNode(kind, screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }))
    },
    [addNode, screenToFlowPosition],
  )

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const kind = e.dataTransfer.getData(DND_MIME)
      if (!isNodeKind(kind)) return
      addNode(kind, screenToFlowPosition({ x: e.clientX, y: e.clientY }))
    },
    [addNode, screenToFlowPosition],
  )

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) => addEdge({ ...connection, id: createId(), data: {} }, eds)),
    [setEdges],
  )

  const exportJson = () => {
    const flowchart = toFlowchart(nodes, edges)
    const blob = new Blob([JSON.stringify(flowchart, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'floo-flowchart.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const importJson = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isFlowchart(parsed)) throw new Error('Not a valid Floo flowchart.')
      setNodes(toRfNodes(parsed))
      setEdges(toRfEdges(parsed))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not read file.')
    }
  }

  return (
    <div className="floo-editor">
      <div className="floo-sidebar">
        <Palette onAdd={onPaletteAdd} />
        {selectedNode && (
          <NodeInspector node={selectedNode} onChange={onNodeLabelChange} focusToken={labelFocusToken} />
        )}
        {selectedEdge && (
          <EdgeInspector
            edge={selectedEdge}
            nodes={nodes}
            onChange={onEdgeLabelChange}
            focusToken={labelFocusToken}
          />
        )}
        <div className="floo-sidebar__footer">
          <button type="button" className="floo-sidebar__btn" onClick={onAutoLayout} disabled={layingOut}>
            {layingOut ? 'Laying out…' : 'Auto-layout'}
          </button>
          <button type="button" className="floo-sidebar__btn" onClick={exportJson}>
            Export JSON
          </button>
          <label className="floo-sidebar__btn">
            Import JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void importJson(file)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </div>
      <div className="floo-canvas" ref={canvasRef}>
        <ReactFlow
          nodes={renderNodes}
          edges={renderEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onSelectionChange={onSelectionChange}
          onEdgeDoubleClick={onLabelEditShortcut}
          onNodeDoubleClick={onLabelEditShortcut}
          onConnect={onConnect}
          onDragOver={onDragOver}
          onDrop={onDrop}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
        <PromptPanel nodes={nodes} setNodes={setNodes} edges={edges} setEdges={setEdges} />
      </div>
    </div>
  )
}

export default function FlowEditor() {
  return (
    <ReactFlowProvider>
      <FlowEditorInner />
    </ReactFlowProvider>
  )
}