import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  type EdgeChange,
  type NodeChange,
  type OnSelectionChangeParams,
} from '@xyflow/react'
import type { NodeKind } from '@floo/shared'

import '@xyflow/react/dist/style.css'

import { isFlowchart, leftPortUsage, NODE_KINDS, refreshEdgePorts, setEdgeLabel, setNodeLabel, setNodeUrl, toFlowchart, toRfEdges, toRfNodes } from '../lib/adapters'
import type { FlooEdge as FlooEdgeType, FlooNode as FlooNodeType } from '../lib/adapters'
import {
  EXPORT_BACKGROUND,
  captureFlowchart,
  downloadDataUrl,
  exportFilename,
  planExport,
  type ImageFormat,
} from '../lib/exportImage'
import {
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  createHistory,
  pushStack,
  redoStacks,
  undoStacks,
  type GraphSnapshot,
  type HistoryStacks,
} from '../lib/history'
import { createId, defaultLabel } from '../lib/ids'
import { sampleFlowchart } from '../lib/sample'
import { applyTheme, getInitialTheme, type Theme } from '../lib/theme'
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
  text: FlooNode,
  media: FlooNode,
}

const edgeTypes = {
  default: FlooEdge,
}

const DND_MIME = 'application/floo'

function isNodeKind(value: unknown): value is NodeKind {
  return (NODE_KINDS as readonly string[]).includes(value as string)
}

function FlowEditorInner() {
  const [nodes, setNodes, onNodesChangeRaw] = useNodesState(toRfNodes(sampleFlowchart))
  const [edges, setEdges, onEdgesChangeRaw] = useEdgesState(toRfEdges(sampleFlowchart))
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [labelFocusToken, setLabelFocusToken] = useState(0)
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme())
  const [history, setHistory] = useState<HistoryStacks>(createHistory)
  const { screenToFlowPosition, getNodesBounds } = useReactFlow()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [layingOut, setLayingOut] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Latest graph for history pushes (synced after each committed render).
  const graphRef = useRef<GraphSnapshot>({ nodes, edges })
  useEffect(() => {
    graphRef.current = { nodes, edges }
  }, [nodes, edges])

  // One undo entry per drag gesture / label typing burst.
  const dragActiveRef = useRef(false)
  const labelSessionRef = useRef(false)
  const labelSessionTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'))
  }, [])

  const selectedEdge = selectedEdgeId ? (edges.find((e) => e.id === selectedEdgeId) ?? null) : null
  const selectedNode = selectedNodeId ? (nodes.find((n) => n.id === selectedNodeId) ?? null) : null

  const canUndo = historyCanUndo(history)
  const canRedo = historyCanRedo(history)

  const pushHistory = useCallback(() => {
    setHistory((h) => pushStack(h, graphRef.current))
  }, [])

  /** Replace the whole graph as a single undoable step. */
  const applyGraph = useCallback(
    (nextNodes: FlooNodeType[], nextEdges: FlooEdgeType[]) => {
      pushHistory()
      setNodes(nextNodes)
      setEdges(nextEdges)
    },
    [pushHistory, setNodes, setEdges],
  )

  const undo = useCallback(() => {
    setHistory((h) => {
      const step = undoStacks(h, graphRef.current)
      if (!step) return h
      setNodes(step.present.nodes)
      setEdges(step.present.edges)
      return step.stacks
    })
  }, [setNodes, setEdges])

  const redo = useCallback(() => {
    setHistory((h) => {
      const step = redoStacks(h, graphRef.current)
      if (!step) return h
      setNodes(step.present.nodes)
      setEdges(step.present.edges)
      return step.stacks
    })
  }, [setNodes, setEdges])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (!(e.metaKey || e.ctrlKey)) return

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  /** Classify React Flow changes: only structural/drag commits hit history. */
  const onNodesChange = useCallback(
    (changes: NodeChange<FlooNodeType>[]) => {
      const removes = changes.some((c) => c.type === 'remove')
      const dragStart = changes.some((c) => c.type === 'position' && c.dragging === true)
      const dragEnd = changes.some((c) => c.type === 'position' && c.dragging === false)

      if (removes || (dragStart && !dragActiveRef.current)) {
        pushHistory()
      }
      if (dragStart) dragActiveRef.current = true
      if (dragEnd) dragActiveRef.current = false

      onNodesChangeRaw(changes)
    },
    [pushHistory, onNodesChangeRaw],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlooEdgeType>[]) => {
      if (changes.some((c) => c.type === 'remove')) {
        pushHistory()
      }
      onEdgesChangeRaw(changes)
    },
    [pushHistory, onEdgesChangeRaw],
  )

  const beginLabelSession = useCallback(() => {
    if (!labelSessionRef.current) {
      pushHistory()
      labelSessionRef.current = true
    }
    window.clearTimeout(labelSessionTimerRef.current)
    labelSessionTimerRef.current = window.setTimeout(() => {
      labelSessionRef.current = false
    }, 600)
  }, [pushHistory])

  useEffect(() => () => window.clearTimeout(labelSessionTimerRef.current), [])

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
      beginLabelSession()
      setEdges((eds) => setEdgeLabel(eds, selectedEdgeId, label))
    },
    [selectedEdgeId, beginLabelSession, setEdges],
  )

  const onNodeLabelChange = useCallback(
    (label: string) => {
      if (!selectedNodeId) return
      beginLabelSession()
      setNodes((nds) => setNodeLabel(nds, selectedNodeId, label))
    },
    [selectedNodeId, beginLabelSession, setNodes],
  )

  const onNodeUrlChange = useCallback(
    (url: string) => {
      if (!selectedNodeId) return
      beginLabelSession()
      setNodes((nds) => setNodeUrl(nds, selectedNodeId, url))
    },
    [selectedNodeId, beginLabelSession, setNodes],
  )

  const onAutoLayout = useCallback(async () => {
    setLayingOut(true)
    try {
      const { layoutFlowchart } = await import('../lib/layout')
      const laid = await layoutFlowchart(toFlowchart(nodes, edges))
      applyGraph(toRfNodes(laid), toRfEdges(laid))
    } finally {
      setLayingOut(false)
    }
  }, [nodes, edges, applyGraph])

  const addNode = useCallback(
    (kind: NodeKind, position: { x: number; y: number }) => {
      pushHistory()
      setNodes((nds) =>
        nds.concat({
          id: createId(),
          type: kind,
          position,
          data: { kind, label: defaultLabel(kind) },
        }),
      )
    },
    [pushHistory, setNodes],
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
    (connection: Connection) => {
      pushHistory()
      setEdges((eds) => addEdge({ ...connection, id: createId(), data: {} }, eds))
    },
    [pushHistory, setEdges],
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
      applyGraph(toRfNodes(parsed), toRfEdges(parsed))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not read file.')
    }
  }

  const isCanvasEmpty = nodes.length === 0 && edges.length === 0

  const exportImage = useCallback(
    async (format: ImageFormat) => {
      if (isCanvasEmpty || exporting) return
      const viewportEl = canvasRef.current?.querySelector<HTMLElement>('.react-flow__viewport')
      if (!viewportEl) return

      setExporting(true)
      try {
        setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)))
        setEdges((eds) => eds.map((e) => (e.selected ? { ...e, selected: false } : e)))
        setSelectedNodeId(null)
        setSelectedEdgeId(null)
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })

        const plan = planExport(getNodesBounds(nodes))
        const dataUrl = await captureFlowchart({
          viewportEl,
          plan,
          format,
          backgroundColor: theme === 'dark' ? EXPORT_BACKGROUND.dark : EXPORT_BACKGROUND.light,
          pixelRatio: Math.min(2, window.devicePixelRatio || 1),
        })
        downloadDataUrl(dataUrl, exportFilename(format))
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Could not export image.')
      } finally {
        setExporting(false)
      }
    },
    [isCanvasEmpty, exporting, nodes, theme, getNodesBounds, setNodes, setEdges],
  )

  const clearFlowchart = useCallback(() => {
    if (isCanvasEmpty) return
    if (!window.confirm('Clear the entire flowchart? You can undo this.')) return
    pushHistory()
    setNodes([])
    setEdges([])
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
  }, [isCanvasEmpty, pushHistory, setNodes, setEdges])

  return (
    <div className="floo-editor">
      <div className="floo-sidebar">
        <Palette onAdd={onPaletteAdd} />
        {selectedNode && (
          <NodeInspector
            node={selectedNode}
            onChange={onNodeLabelChange}
            onUrlChange={onNodeUrlChange}
            focusToken={labelFocusToken}
          />
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
          <div className="floo-sidebar__btn-row">
            <button type="button" className="floo-sidebar__btn" onClick={undo} disabled={!canUndo}>
              Undo
            </button>
            <button type="button" className="floo-sidebar__btn" onClick={redo} disabled={!canRedo}>
              Redo
            </button>
          </div>
          <button
            type="button"
            className="floo-sidebar__btn floo-sidebar__btn--busy"
            onClick={onAutoLayout}
            disabled={layingOut}
          >
            {layingOut ? 'Laying out…' : 'Auto-layout'}
          </button>
          <div className="floo-sidebar__btn-row">
            <button
              type="button"
              className="floo-sidebar__btn floo-sidebar__btn--busy"
              onClick={() => void exportImage('png')}
              disabled={isCanvasEmpty || exporting}
            >
              {exporting ? 'Exporting…' : 'Export PNG'}
            </button>
            <button
              type="button"
              className="floo-sidebar__btn floo-sidebar__btn--busy"
              onClick={() => void exportImage('jpeg')}
              disabled={isCanvasEmpty || exporting}
            >
              Export JPG
            </button>
          </div>
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
          <button type="button" className="floo-sidebar__btn" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
          <button
            type="button"
            className="floo-sidebar__btn floo-sidebar__btn--danger"
            onClick={clearFlowchart}
            disabled={isCanvasEmpty}
          >
            Clear
          </button>
        </div>
      </div>
      <div className="floo-canvas" ref={canvasRef}>
        <ReactFlow
          nodes={renderNodes}
          edges={renderEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          colorMode={theme}
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
        <PromptPanel nodes={nodes} edges={edges} onApplyGraph={applyGraph} />
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