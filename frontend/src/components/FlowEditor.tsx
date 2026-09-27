import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react'
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
import type { Drawing, DrawingPoint, NodeKind } from '@floo/shared'

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
import {
  DEFAULT_PEN_COLOR,
  DEFAULT_PEN_WIDTH,
  PEN_SIZE_MAX,
  PEN_SIZE_MIN,
  anchorForStroke,
  drawingsBounds,
  unionRect,
  type DrawTool,
} from '../lib/drawing'
import { sampleFlowchart } from '../lib/sample'
import { applyTheme, getInitialTheme, type Theme } from '../lib/theme'
import FlooNode from '../nodes/FlooNode'
import { DrawLayer } from './DrawLayer'
import { ColorPicker } from './ColorPicker'
import { FlooEdge, type FlooEdgeData } from './FlooEdge'
import { ShapesMenu } from './ShapesMenu'
import { PromptPanel } from './PromptPanel'
import './FlowEditor.css'

const nodeTypes = Object.fromEntries(NODE_KINDS.map((kind) => [kind, FlooNode] as const))

const edgeTypes = {
  default: FlooEdge,
}

const DND_MIME = 'application/floo'

type DockMenu = 'shapes' | 'more' | null
type NodeMenu = { x: number; y: number; nodeId: string } | null
type DockIconName =
  | 'select'
  | 'draw'
  | 'eraser'
  | 'shapes'
  | 'text'
  | 'media'
  | 'more'

function DockIcon({ name }: { name: DockIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === 'select' && (
        <path
          d="M5 3.5 5 19l4.2-4.3 2.9 6.1 3-1.4-2.9-6.1H18z"
          fill="currentColor"
          stroke="none"
        />
      )}
      {name === 'draw' && (
        <>
          <path d="M4 20h4L20 8l-4-4L4 16v4z" />
          <path d="M14.5 5.5 18.5 9.5" />
        </>
      )}
      {name === 'eraser' && (
        <>
          <path d="M8.5 20.5H20.5" />
          <path d="M16.2 4.3 20 8.1 10.4 17.7 6.6 13.9z" />
          <path d="M10.4 17.7 6.6 13.9" />
        </>
      )}
      {name === 'shapes' && (
        <>
          <circle cx="8" cy="8" r="4.2" />
          <rect x="12.2" y="12.2" width="8.4" height="8.4" rx="1.2" />
        </>
      )}
      {name === 'text' && (
        <path d="M5 6.5V5h14v1.5M12 5v14M9 19h6" />
      )}
      {name === 'media' && (
        <>
          <rect x="3.5" y="5" width="17" height="14" rx="2" />
          <circle cx="8.5" cy="10" r="1.3" />
          <path d="M4 17l4.5-4.5 3 3 3-3.5L20 17" />
        </>
      )}
      {name === 'more' && (
        <>
          <circle cx="5.5" cy="12" r="1.7" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
          <circle cx="18.5" cy="12" r="1.7" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  )
}

function isNodeKind(value: unknown): value is NodeKind {
  return (NODE_KINDS as readonly string[]).includes(value as string)
}

type ActionIconName =
  | 'undo'
  | 'redo'
  | 'layout'
  | 'png'
  | 'jpg'
  | 'braces'
  | 'upload'
  | 'contrast'
  | 'trash'

function ActionIcon({ name }: { name: ActionIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === 'undo' && (
        <>
          <path d="M4 9h10a5 5 0 0 1 0 10h-4" />
          <path d="M7.5 5.5 4 9l3.5 3.5" />
        </>
      )}
      {name === 'redo' && (
        <>
          <path d="M20 9H10a5 5 0 0 0 0 10h4" />
          <path d="M16.5 5.5 20 9l-3.5 3.5" />
        </>
      )}
      {name === 'layout' && (
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <path d="M3.5 9.5h17M9.5 9.5v10" />
        </>
      )}
      {name === 'png' && (
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.4" />
          <path d="M4 17l4.5-4.5 3 3 3-3.5L20 17" />
        </>
      )}
      {name === 'jpg' && (
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <path d="M4 17l4.5-4.5 3 3 3-3.5L20 17" />
          <path d="M7 12.5h3" />
        </>
      )}
      {name === 'braces' && (
        <>
          <path d="M9 4.5c-2 0-2.5 1-2.5 2.5v2c0 1.5-1 2-2 2 1 0 2 .5 2 2v2c0 1.5.5 2.5 2.5 2.5" />
          <path d="M15 4.5c2 0 2.5 1 2.5 2.5v2c0 1.5 1 2 2 2-1 0-2 .5-2 2v2c0 1.5-.5 2.5-2.5 2.5" />
        </>
      )}
      {name === 'upload' && (
        <>
          <path d="M12 16V4.5" />
          <path d="M7.5 9 12 4.5 16.5 9" />
          <path d="M4.5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3" />
        </>
      )}
      {name === 'contrast' && (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none" />
        </>
      )}
      {name === 'trash' && (
        <>
          <path d="M4.5 6.5h15" />
          <path d="M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8v1.7" />
          <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
          <path d="M10.5 10v6.5M13.5 10v6.5" />
        </>
      )}
    </svg>
  )
}

function FlowEditorInner() {
  const [nodes, setNodes, onNodesChangeRaw] = useNodesState(toRfNodes(sampleFlowchart))
  const [edges, setEdges, onEdgesChangeRaw] = useEdgesState(toRfEdges(sampleFlowchart))
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null)
  const [drawings, setDrawings] = useState<Drawing[]>([])
  const [tool, setTool] = useState<DrawTool>('select')
  const [penColor, setPenColor] = useState<string>(DEFAULT_PEN_COLOR)
  const [penWidth, setPenWidth] = useState<number>(DEFAULT_PEN_WIDTH)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null)
  const [nodeMenu, setNodeMenu] = useState<NodeMenu>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const penMenuRef = useRef<HTMLDivElement>(null)
  const nodeMenuRef = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme())
  const [history, setHistory] = useState<HistoryStacks>(createHistory)
  const { screenToFlowPosition, getNodesBounds } = useReactFlow()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [layingOut, setLayingOut] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [dockMenu, setDockMenu] = useState<DockMenu>(null)
  const dockRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dockMenu) return
    const onPointerDown = (e: PointerEvent) => {
      if (!dockRef.current?.contains(e.target as Node)) setDockMenu(null)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDockMenu(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [dockMenu])

  useEffect(() => {
    if (!pickerOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!penMenuRef.current?.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [pickerOpen])

  useEffect(() => {
    if (!nodeMenu) return
    const onPointerDown = (e: PointerEvent) => {
      if (!nodeMenuRef.current?.contains(e.target as Node)) setNodeMenu(null)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNodeMenu(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [nodeMenu])

  // Latest graph for history pushes (synced after each committed render).
  const graphRef = useRef<GraphSnapshot>({ nodes, edges, drawings })
  useEffect(() => {
    graphRef.current = { nodes, edges, drawings }
  }, [nodes, edges, drawings])

  // One undo entry per drag gesture.
  const dragActiveRef = useRef(false)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'))
  }, [])

  const canUndo = historyCanUndo(history)
  const canRedo = historyCanRedo(history)

  const pushHistory = useCallback(() => {
    setHistory((h) => pushStack(h, graphRef.current))
  }, [])

  /** Replace the whole graph as a single undoable step. */
  const applyGraph = useCallback(
    (nextNodes: FlooNodeType[], nextEdges: FlooEdgeType[], nextDrawings?: Drawing[]) => {
      pushHistory()
      setNodes(nextNodes)
      setEdges(nextEdges)
      if (nextDrawings !== undefined) setDrawings(nextDrawings)
    },
    [pushHistory, setNodes, setEdges],
  )

  const undo = useCallback(() => {
    setHistory((h) => {
      const step = undoStacks(h, graphRef.current)
      if (!step) return h
      setNodes(step.present.nodes)
      setEdges(step.present.edges)
      setDrawings(step.present.drawings)
      return step.stacks
    })
  }, [setNodes, setEdges, setDrawings])

  const redo = useCallback(() => {
    setHistory((h) => {
      const step = redoStacks(h, graphRef.current)
      if (!step) return h
      setNodes(step.present.nodes)
      setEdges(step.present.edges)
      setDrawings(step.present.drawings)
      return step.stacks
    })
  }, [setNodes, setEdges, setDrawings])

  const deleteDrawing = useCallback(
    (id: string) => {
      pushHistory()
      setDrawings((ds) => ds.filter((d) => d.id !== id))
      setSelectedDrawingId((current) => (current === id ? null : current))
    },
    [pushHistory],
  )

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return

      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.metaKey && !e.ctrlKey && selectedDrawingId) {
        e.preventDefault()
        deleteDrawing(selectedDrawingId)
        return
      }

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
  }, [undo, redo, selectedDrawingId, deleteDrawing])

  // Ink anchored to a node disappears with it (deletion, AI edit, relayout).
  useEffect(() => {
    setDrawings((ds) => {
      const next = ds.filter((d) => !d.anchorNodeId || nodes.some((n) => n.id === d.anchorNodeId))
      return next.length === ds.length ? ds : next
    })
  }, [nodes])

  useEffect(() => {
    if (selectedDrawingId && !drawings.some((d) => d.id === selectedDrawingId)) {
      setSelectedDrawingId(null)
    }
  }, [drawings, selectedDrawingId])

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

  // Re-derive port ids from live positions on every change (preserving
  // selection/data), so loop-back geometry tracks node drags and applies to
  // charts created before a routing rule changed — not just at import time.
  const renderEdges = useMemo(() => refreshEdgePorts(nodes, edges), [nodes, edges])

  const onSelectionChange = useCallback((selection: OnSelectionChangeParams) => {
    if (selection.nodes.length > 0 || selection.edges.length > 0) {
      setSelectedDrawingId(null)
    }
  }, [])

  // Nodes edit their own label in place, so double-click only opens the input.
  const onNodeEdit = useCallback((_e: ReactMouseEvent, node: FlooNodeType) => {
    setEditingEdgeId(null)
    setEditingNodeId(node.id)
  }, [])

  const commitNodeLabel = useCallback(
    (id: string, label: string) => {
      setEditingNodeId(null)
      pushHistory()
      setNodes((nds) => setNodeLabel(nds, id, label))
    },
    [pushHistory, setNodes],
  )

  const cancelNodeEdit = useCallback(() => setEditingNodeId(null), [])

  // Edits in place like node labels, so double-click only opens the input.
  const onEdgeEdit = useCallback((_e: ReactMouseEvent, edge: { id: string }) => {
    setEditingNodeId(null)
    setEditingEdgeId(edge.id)
  }, [])

  const startEdgeEdit = useCallback((id: string) => {
    setEditingNodeId(null)
    setEditingEdgeId(id)
  }, [])

  const commitEdgeLabel = useCallback(
    (id: string, label: string) => {
      setEditingEdgeId(null)
      pushHistory()
      setEdges((es) => setEdgeLabel(es, id, label))
    },
    [pushHistory, setEdges],
  )

  const cancelEdgeEdit = useCallback(() => setEditingEdgeId(null), [])

  const displayEdges = useMemo(() => {
    return renderEdges.map((edge) => {
      const isEditing = edge.id === editingEdgeId
      const edgeData = (edge.data ?? {}) as FlooEdgeData
      if (!isEditing && edgeData.onStartEdit === startEdgeEdit) return edge
      return {
        ...edge,
        data: {
          ...edge.data,
          onStartEdit: startEdgeEdit,
          ...(isEditing
            ? {
                editing: true,
                onCommitLabel: commitEdgeLabel,
                onCancelEdit: cancelEdgeEdit,
              }
            : {}),
        },
      }
    })
  }, [renderEdges, editingEdgeId, startEdgeEdit, commitEdgeLabel, cancelEdgeEdit])

  // Decorate nodes with left-port usage so decisions can omit unused left
  // handles, and hand the one being renamed the callbacks its inline editor
  // needs. Unchanged nodes are returned by reference to keep renders cheap.
  const renderNodes = useMemo(() => {
    const usage = leftPortUsage(renderEdges)
    return nodes.map((node) => {
      const flags = usage.get(node.id)
      const leftSource = Boolean(flags?.leftSource)
      const leftTarget = Boolean(flags?.leftTarget)
      const isEditing = node.id === editingNodeId
      const unchanged =
        node.data.leftSource === leftSource &&
        node.data.leftTarget === leftTarget &&
        node.data.editing === (isEditing || undefined)
      if (unchanged) return node
      return {
        ...node,
        data: {
          ...node.data,
          leftSource,
          leftTarget,
          editing: isEditing || undefined,
          ...(isEditing ? { onCommitLabel: commitNodeLabel, onCancelEdit: cancelNodeEdit } : {}),
        },
      }
    })
  }, [nodes, renderEdges, editingNodeId, commitNodeLabel, cancelNodeEdit])

  const onNodeContextMenu = useCallback((e: ReactMouseEvent, node: FlooNodeType) => {
    if (node.data.kind !== 'media') return
    e.preventDefault()
    setNodeMenu({ x: e.clientX, y: e.clientY, nodeId: node.id })
  }, [])

  const uploadMediaImage = useCallback(
    (file: File | undefined) => {
      const nodeId = nodeMenu?.nodeId
      setNodeMenu(null)
      if (!file || !nodeId) return
      const reader = new FileReader()
      reader.onload = () => {
        const url = String(reader.result ?? '')
        if (!url.startsWith('data:image/')) return
        pushHistory()
        setNodes((nds) => setNodeUrl(nds, nodeId, url))
      }
      reader.readAsDataURL(file)
    },
    [nodeMenu, pushHistory, setNodes],
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

  const selectDrawing = useCallback(
    (id: string | null) => {
      setSelectedDrawingId(id)
      if (id) {
        setNodes((nds) =>
          nds.some((n) => n.selected) ? nds.map((n) => (n.selected ? { ...n, selected: false } : n)) : nds,
        )
        setEdges((eds) =>
          eds.some((e) => e.selected) ? eds.map((e) => (e.selected ? { ...e, selected: false } : e)) : eds,
        )
      }
    },
    [setNodes, setEdges],
  )

  const beginDrawingEdit = useCallback(() => {
    pushHistory()
  }, [pushHistory])

  const onDrawCommit = useCallback(
    (points: DrawingPoint[]) => {
      const anchor = anchorForStroke(points, nodes)
      let relative = points
      const node = anchor ? nodes.find((n) => n.id === anchor) : undefined
      if (node) {
        relative = points.map((p) => ({ x: p.x - node.position.x, y: p.y - node.position.y }))
      }
      pushHistory()
      setDrawings((ds) => [
        ...ds,
        { id: createId(), points: relative, color: penColor, width: penWidth, anchorNodeId: anchor },
      ])
    },
    [nodes, pushHistory, penColor, penWidth],
  )

  const onEraseDrawings = useCallback((ids: string[]) => {
    setDrawings((ds) => ds.filter((d) => !ids.includes(d.id)))
  }, [])

  const onMoveDrawing = useCallback((id: string, delta: DrawingPoint) => {
    setDrawings((ds) =>
      ds.map((d) =>
        d.id === id
          ? { ...d, points: d.points.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y })) }
          : d,
      ),
    )
  }, [])

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
    const flowchart = { ...toFlowchart(nodes, edges), drawings }
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
      applyGraph(toRfNodes(parsed), toRfEdges(parsed), parsed.drawings ?? [])
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not read file.')
    }
  }

  const isCanvasEmpty = nodes.length === 0 && edges.length === 0 && drawings.length === 0

  const exportImage = useCallback(
    async (format: ImageFormat) => {
      if (isCanvasEmpty || exporting) return
      const viewportEl = canvasRef.current?.querySelector<HTMLElement>('.react-flow__viewport')
      if (!viewportEl) return

      setExporting(true)
      try {
        setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)))
        setEdges((eds) => eds.map((e) => (e.selected ? { ...e, selected: false } : e)))
        setSelectedDrawingId(null)
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })

        const nodeBounds = getNodesBounds(nodes)
        const inkBounds = drawingsBounds(drawings, nodes)
        const content =
          inkBounds === null
            ? nodeBounds
            : nodes.length === 0
              ? inkBounds
              : unionRect(nodeBounds, inkBounds)
        const plan = planExport(content)
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
    [isCanvasEmpty, exporting, nodes, drawings, theme, getNodesBounds, setNodes, setEdges],
  )

  const clearFlowchart = useCallback(() => {
    if (isCanvasEmpty) return
    if (!window.confirm('Clear the entire flowchart? You can undo this.')) return
    pushHistory()
    setNodes([])
    setEdges([])
    setDrawings([])
    setSelectedDrawingId(null)
  }, [isCanvasEmpty, pushHistory, setNodes, setEdges, setDrawings])

  return (
    <div className="floo-editor">
      <div
        className={`floo-canvas${tool === 'pen' ? ' floo-canvas--pen' : tool === 'eraser' ? ' floo-canvas--eraser' : ''}`}
        ref={canvasRef}
      >
        <ReactFlow
          nodes={renderNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          colorMode={theme}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onSelectionChange={onSelectionChange}
          onEdgeDoubleClick={onEdgeEdit}
          onNodeDoubleClick={onNodeEdit}
          onNodeContextMenu={onNodeContextMenu}
          onConnect={onConnect}
          onDragOver={onDragOver}
          onDrop={onDrop}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls />
          <MiniMap pannable zoomable position="top-right" />
        </ReactFlow>
        <DrawLayer
          containerRef={canvasRef}
          nodes={nodes}
          drawings={drawings}
          tool={tool}
          color={penColor}
          width={penWidth}
          selectedId={selectedDrawingId}
          onSelect={selectDrawing}
          onDrawCommit={onDrawCommit}
          onBeginEdit={beginDrawingEdit}
          onErase={onEraseDrawings}
          onMoveStroke={onMoveDrawing}
        />
        {nodeMenu && (
          <div
            className="floo-node-menu"
            ref={nodeMenuRef}
            role="menu"
            style={{ left: nodeMenu.x, top: nodeMenu.y }}
          >
            <label className="floo-node-menu__item" role="menuitem">
              Upload image
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  uploadMediaImage(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        )}
        <div
          className="floo-dock"
          ref={dockRef}
          role="toolbar"
          aria-label="Canvas tools"
          aria-orientation="vertical"
        >
          <button
            type="button"
            className={`floo-dock__btn${tool === 'select' ? ' is-active' : ''}`}
            onClick={() => setTool('select')}
            aria-pressed={tool === 'select'}
            aria-label="Select"
            data-tip="Select"
          >
            <DockIcon name="select" />
          </button>
          <div className="floo-dock__slot">
            <button
              type="button"
              className={`floo-dock__btn${tool === 'pen' ? ' is-active' : ''}`}
              onClick={() => setTool('pen')}
              aria-pressed={tool === 'pen'}
              aria-label="Draw"
              data-tip="Draw"
            >
              <DockIcon name="draw" />
            </button>
            {tool === 'pen' && (
              <div className="floo-dock__menu floo-dock__menu--pen" ref={penMenuRef}>
                <button
                  type="button"
                  className="floo-pen-color"
                  onClick={() => setPickerOpen((o) => !o)}
                  aria-expanded={pickerOpen}
                  aria-label="Pen colour"
                >
                  <span className="floo-pen-color__swatch" style={{ background: penColor }} />
                  <span className="floo-pen-color__label">Colour</span>
                  <span className="floo-pen-color__hex">{penColor}</span>
                </button>
                {pickerOpen && <ColorPicker value={penColor} onChange={setPenColor} />}
                <div className="floo-pen-size">
                  <div className="floo-pen-size__head">
                    <span>Size</span>
                    <span className="floo-pen-size__value">{penWidth}px</span>
                  </div>
                  <input
                    type="range"
                    min={PEN_SIZE_MIN}
                    max={PEN_SIZE_MAX}
                    step={1}
                    value={penWidth}
                    onChange={(e) => setPenWidth(Number(e.target.value))}
                    aria-label="Brush size"
                  />
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            className={`floo-dock__btn${tool === 'eraser' ? ' is-active' : ''}`}
            onClick={() => setTool('eraser')}
            aria-pressed={tool === 'eraser'}
            aria-label="Eraser"
            data-tip="Eraser"
          >
            <DockIcon name="eraser" />
          </button>
          <button
            type="button"
            className="floo-dock__btn"
            onClick={() => onPaletteAdd('media')}
            aria-label="Add image"
            data-tip="Image"
          >
            <DockIcon name="media" />
          </button>
          <button
            type="button"
            className="floo-dock__btn"
            onClick={() => onPaletteAdd('text')}
            aria-label="Add text box"
            data-tip="Text box"
          >
            <DockIcon name="text" />
          </button>
          <div className="floo-dock__slot">
            <button
              type="button"
              className="floo-dock__btn"
              onClick={() => setDockMenu(dockMenu === 'shapes' ? null : 'shapes')}
              aria-expanded={dockMenu === 'shapes'}
              aria-haspopup="menu"
              aria-label="Shapes"
              data-tip="Shapes"
            >
              <DockIcon name="shapes" />
            </button>
            {dockMenu === 'shapes' && <ShapesMenu onAdd={onPaletteAdd} />}
          </div>
          <div className="floo-dock__slot">
            <button
              type="button"
              className="floo-dock__btn"
              onClick={() => setDockMenu(dockMenu === 'more' ? null : 'more')}
              aria-expanded={dockMenu === 'more'}
              aria-haspopup="menu"
              aria-label="More options"
              data-tip="More options"
            >
              <DockIcon name="more" />
            </button>
            {dockMenu === 'more' && (
              <div
                className="floo-dock__menu floo-dock__menu--more"
                role="menu"
                aria-label="More options"
                onClick={() => setDockMenu(null)}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="floo-sidebar__btn"
                  onClick={undo}
                  disabled={!canUndo}
                >
                  <ActionIcon name="undo" />
                  Undo
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="floo-sidebar__btn"
                  onClick={redo}
                  disabled={!canRedo}
                >
                  <ActionIcon name="redo" />
                  Redo
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="floo-sidebar__btn floo-sidebar__btn--busy"
                  onClick={onAutoLayout}
                  disabled={layingOut}
                >
                  <ActionIcon name="layout" />
                  {layingOut ? 'Laying out…' : 'Auto-layout'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="floo-sidebar__btn floo-sidebar__btn--busy"
                  onClick={() => void exportImage('png')}
                  disabled={isCanvasEmpty || exporting}
                >
                  <ActionIcon name="png" />
                  {exporting ? 'Exporting…' : 'Export PNG'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="floo-sidebar__btn floo-sidebar__btn--busy"
                  onClick={() => void exportImage('jpeg')}
                  disabled={isCanvasEmpty || exporting}
                >
                  <ActionIcon name="jpg" />
                  Export JPG
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="floo-sidebar__btn"
                  onClick={exportJson}
                >
                  <ActionIcon name="braces" />
                  Export JSON
                </button>
                <label
                  className="floo-sidebar__btn"
                  role="menuitem"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ActionIcon name="upload" />
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
                <button
                  type="button"
                  role="menuitem"
                  className="floo-sidebar__btn"
                  onClick={toggleTheme}
                >
                  <ActionIcon name="contrast" />
                  {theme === 'dark' ? 'Light theme' : 'Dark theme'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="floo-sidebar__btn floo-sidebar__btn--danger"
                  onClick={clearFlowchart}
                  disabled={isCanvasEmpty}
                >
                  <ActionIcon name="trash" />
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>
        <PromptPanel nodes={nodes} edges={edges} drawings={drawings} onApplyGraph={applyGraph} />
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