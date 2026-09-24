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
  light: '#ffffff',
  dark: '#0f172a',
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

  if (options.format === 'png') {
    return toPng(options.viewportEl, base)
  }
  return toJpeg(options.viewportEl, { ...base, quality: 0.92 })
}
