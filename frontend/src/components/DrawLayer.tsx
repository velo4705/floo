import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useReactFlow, useViewport } from '@xyflow/react'

import type { Drawing, DrawingPoint } from '@floo/shared'

import {
  HIT_TOLERANCE_PX,
  absolutePoints,
  hitDrawing,
  hitTopmostStroke,
  roundPoint,
  toPathData,
} from '../lib/drawing'
import type { DrawTool } from '../lib/drawing'
import type { FlooNode } from '../lib/adapters'

interface DrawLayerProps {
  containerRef: { current: HTMLDivElement | null }
  nodes: FlooNode[]
  drawings: Drawing[]
  tool: DrawTool
  color: string
  width: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  onDrawCommit: (points: DrawingPoint[]) => void
  /** One undo entry per erase/move gesture — called before its first mutation. */
  onBeginEdit: () => void
  onErase: (ids: string[]) => void
  onMoveStroke: (id: string, delta: DrawingPoint) => void
}

type Gesture =
  | { kind: 'pen'; points: DrawingPoint[] }
  | { kind: 'erase'; removed: Set<string>; began: boolean }
  | { kind: 'move'; id: string; last: DrawingPoint; began: boolean }
  | null

const UI_EXCLUSIONS = '.prompt-panel, .react-flow__controls, .react-flow__minimap, .react-flow__attribution'

export function DrawLayer(props: DrawLayerProps) {
  const { tool } = props
  const { screenToFlowPosition } = useReactFlow()
  const { zoom } = useViewport()
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null)
  const [preview, setPreview] = useState<DrawingPoint[] | null>(null)
  const gestureRef = useRef<Gesture>(null)
  const propsRef = useRef(props)
  propsRef.current = props

  // The overlay lives inside .react-flow__viewport so it follows the pan/zoom
  // transform and is captured by the PNG/JPG export.
  useEffect(() => {
    const el = props.containerRef.current?.querySelector<HTMLDivElement>('.react-flow__viewport')
    setViewportEl(el ?? null)
  })

  useEffect(() => {
    const tolerance = HIT_TOLERANCE_PX / zoom

    const toFlow = (e: PointerEvent): DrawingPoint =>
      roundPoint(screenToFlowPosition({ x: e.clientX, y: e.clientY }))

    const isCanvasTarget = (e: PointerEvent): boolean => {
      const target = e.target as Element | null
      if (!target || typeof target.closest !== 'function') return false
      if (!target.closest('.floo-canvas')) return false
      if (target.closest(UI_EXCLUSIONS)) return false
      return true
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (!isCanvasTarget(e)) return
      const p = propsRef.current

      // A second pointer mid-gesture must not reach React Flow.
      if (gestureRef.current) {
        if (p.tool !== 'select') {
          e.preventDefault()
          e.stopPropagation()
        }
        return
      }

      if (p.tool === 'pen') {
        e.preventDefault()
        e.stopPropagation()
        const point = toFlow(e)
        gestureRef.current = { kind: 'pen', points: [point] }
        setPreview([point])
        return
      }

      const point = toFlow(e)

      if (p.tool === 'eraser') {
        e.preventDefault()
        e.stopPropagation()
        const gesture: NonNullable<Gesture> = { kind: 'erase', removed: new Set(), began: false }
        gestureRef.current = gesture
        const hit = hitTopmostStroke(point, p.drawings, p.nodes, tolerance)
        if (hit) {
          gesture.removed.add(hit.id)
          gesture.began = true
          p.onBeginEdit()
          p.onErase([hit.id])
        }
        return
      }

      const hit = hitTopmostStroke(point, p.drawings, p.nodes, tolerance)
      if (hit) {
        e.preventDefault()
        e.stopPropagation()
        p.onSelect(hit.id)
        gestureRef.current = { kind: 'move', id: hit.id, last: point, began: false }
      } else {
        p.onSelect(null)
      }
    }

    const finishGesture = (e: PointerEvent) => {
      const gesture = gestureRef.current
      if (!gesture) return
      const p = propsRef.current
      if (gesture.kind === 'pen') {
        e.preventDefault()
        e.stopPropagation()
        if (gesture.points.length >= 2) p.onDrawCommit(gesture.points)
        setPreview(null)
      } else if (gesture.kind === 'erase') {
        e.preventDefault()
        e.stopPropagation()
      }
      gestureRef.current = null
    }

    const onPointerMove = (e: PointerEvent) => {
      const gesture = gestureRef.current
      if (!gesture) return
      if (e.buttons === 0) {
        finishGesture(e)
        return
      }
      const p = propsRef.current

      if (gesture.kind === 'pen') {
        e.preventDefault()
        e.stopPropagation()
        const point = toFlow(e)
        const last = gesture.points[gesture.points.length - 1]
        if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.5) return
        gesture.points.push(point)
        setPreview([...gesture.points])
        return
      }

      if (gesture.kind === 'erase') {
        e.preventDefault()
        e.stopPropagation()
        const point = toFlow(e)
        const ids: string[] = []
        for (let i = p.drawings.length - 1; i >= 0; i -= 1) {
          const d = p.drawings[i]!
          if (gesture.removed.has(d.id)) continue
          if (hitDrawing(point, absolutePoints(d, p.nodes), d.width, tolerance)) ids.push(d.id)
        }
        if (ids.length > 0) {
          if (!gesture.began) {
            gesture.began = true
            p.onBeginEdit()
          }
          for (const id of ids) gesture.removed.add(id)
          p.onErase(ids)
        }
        return
      }

      e.preventDefault()
      e.stopPropagation()
      const point = toFlow(e)
      const delta = { x: point.x - gesture.last.x, y: point.y - gesture.last.y }
      if (delta.x === 0 && delta.y === 0) return
      if (!gesture.began) {
        gesture.began = true
        p.onBeginEdit()
      }
      p.onMoveStroke(gesture.id, delta)
      gesture.last = point
    }

    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('pointermove', onPointerMove, true)
    window.addEventListener('pointerup', finishGesture, true)
    window.addEventListener('pointercancel', finishGesture, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('pointermove', onPointerMove, true)
      window.removeEventListener('pointerup', finishGesture, true)
      window.removeEventListener('pointercancel', finishGesture, true)
    }
  }, [tool, zoom, screenToFlowPosition])

  if (!viewportEl) return null

  const { nodes, drawings, color, width, selectedId } = props

  return createPortal(
    <svg
      className="floo-draw-layer"
      width="1"
      height="1"
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
    >
      {drawings.map((d) => {
        const data = toPathData(absolutePoints(d, nodes))
        return (
          <g key={d.id}>
            {d.id === selectedId && (
              <path
                className="floo-draw-layer__select"
                d={data}
                strokeWidth={d.width + 6}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            )}
            <path
              d={data}
              stroke={d.color}
              strokeWidth={d.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </g>
        )
      })}
      {preview !== null &&
        (preview.length === 1 ? (
          <circle cx={preview[0]!.x} cy={preview[0]!.y} r={width / 2} fill={color} />
        ) : (
          <path
            d={toPathData(preview)}
            stroke={color}
            strokeWidth={width}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
    </svg>,
    viewportEl,
  )
}
