import { getViewportForBounds } from '@xyflow/react'
import { toJpeg, toPng } from 'html-to-image'

export type ImageFormat = 'png' | 'jpeg'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface ExportPlan {
  bounds: Rect
  imageWidth: number
  imageHeight: number
}

export const EXPORT_PADDING = 48
export const EXPORT_MAX_DIMENSION = 4096
export const EXPORT_BACKGROUND = {
  light: '#fbf9f4',
  dark: '#313244',
} as const

export function planExport(
  content: Rect,
  options?: { padding?: number; maxDimension?: number },
): ExportPlan {
  const padding = options?.padding ?? EXPORT_PADDING
  const maxDimension = options?.maxDimension ?? EXPORT_MAX_DIMENSION

  const width = Math.max(1, content.width + padding * 2)
  const height = Math.max(1, content.height + padding * 2)
  const scale = Math.min(1, maxDimension / Math.max(width, height))

  return {
    bounds: {
      x: content.x - padding,
      y: content.y - padding,
      width,
      height,
    },
    imageWidth: Math.max(1, Math.round(width * scale)),
    imageHeight: Math.max(1, Math.round(height * scale)),
  }
}

export function exportFilename(format: ImageFormat): string {
  return format === 'png' ? 'floo-flowchart.png' : 'floo-flowchart.jpg'
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = filename
  anchor.click()
}

export const EDGE_STROKE_STYLE_PROPERTIES = [
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-opacity',
] as const

export interface InlineStrokeTarget {
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
  style: { setProperty(property: string, value: string): void }
}

export function inlineEdgeStrokeStyles<T extends InlineStrokeTarget>(
  paths: ArrayLike<T>,
  getComputedStroke: (path: T) => { getPropertyValue(name: string): string },
): () => void {
  const previousStyles: Array<[T, string | null]> = []

  for (let i = 0; i < paths.length; i += 1) {
    const path = paths[i]!
    const computed = getComputedStroke(path)
    previousStyles.push([path, path.getAttribute('style')])

    for (const property of EDGE_STROKE_STYLE_PROPERTIES) {
      const value = computed.getPropertyValue(property).trim()
      if (value) {
        path.style.setProperty(property, value)
      }
    }
  }

  return () => {
    for (const [path, previousStyle] of previousStyles) {
      if (previousStyle === null) {
        path.removeAttribute('style')
      } else {
        path.setAttribute('style', previousStyle)
      }
    }
  }
}

export async function captureFlowchart(options: {
  viewportEl: HTMLElement
  plan: ExportPlan
  format: ImageFormat
  backgroundColor: string
  pixelRatio?: number
}): Promise<string> {
  const viewport = getViewportForBounds(
    options.plan.bounds,
    options.plan.imageWidth,
    options.plan.imageHeight,
    0.01,
    10,
    0,
  )

  const base = {
    backgroundColor: options.backgroundColor,
    width: options.plan.imageWidth,
    height: options.plan.imageHeight,
    pixelRatio: options.pixelRatio ?? 1,
    style: {
      width: `${options.plan.imageWidth}px`,
      height: `${options.plan.imageHeight}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      transformOrigin: '0 0',
    },
  }

  const restoreEdgeStroke = inlineEdgeStrokeStyles(
    options.viewportEl.querySelectorAll<SVGPathElement>('path.react-flow__edge-path'),
    (path) => window.getComputedStyle(path),
  )

  try {
    if (options.format === 'png') {
      return await toPng(options.viewportEl, base)
    }
    return await toJpeg(options.viewportEl, { ...base, quality: 0.92 })
  } finally {
    restoreEdgeStroke()
  }
}
