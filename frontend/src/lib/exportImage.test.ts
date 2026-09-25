import { describe, expect, it } from 'vitest'

import {
  EXPORT_MAX_DIMENSION,
  EXPORT_PADDING,
  exportFilename,
  inlineEdgeStrokeStyles,
  planExport,
} from './exportImage'

describe('planExport', () => {
  it('pads content bounds on every side', () => {
    const plan = planExport({ x: 100, y: 200, width: 400, height: 300 })

    expect(plan.bounds.x).toBe(100 - EXPORT_PADDING)
    expect(plan.bounds.y).toBe(200 - EXPORT_PADDING)
    expect(plan.bounds.width).toBe(400 + EXPORT_PADDING * 2)
    expect(plan.bounds.height).toBe(300 + EXPORT_PADDING * 2)
    expect(plan.imageWidth).toBe(plan.bounds.width)
    expect(plan.imageHeight).toBe(plan.bounds.height)
  })

  it('caps the longest side at maxDimension while keeping aspect ratio', () => {
    const plan = planExport({ x: 0, y: 0, width: 10_000, height: 1_000 }, { maxDimension: 1_000 })

    expect(plan.imageWidth).toBe(1_000)
    expect(plan.imageHeight).toBeLessThan(plan.imageWidth)
    expect(plan.imageHeight).toBeGreaterThan(0)
    const contentRatio = plan.bounds.width / plan.bounds.height
    const imageRatio = plan.imageWidth / plan.imageHeight
    expect(Math.abs(contentRatio - imageRatio)).toBeLessThan(0.05)
  })

  it('does not upscale small charts past their padded size', () => {
    const plan = planExport({ x: 0, y: 0, width: 200, height: 100 })

    expect(plan.imageWidth).toBe(200 + EXPORT_PADDING * 2)
    expect(plan.imageHeight).toBe(100 + EXPORT_PADDING * 2)
  })

  it('never produces zero dimensions for empty content', () => {
    const plan = planExport({ x: 0, y: 0, width: 0, height: 0 })

    expect(plan.imageWidth).toBeGreaterThan(0)
    expect(plan.imageHeight).toBeGreaterThan(0)
  })

  it('uses the default max dimension cap', () => {
    const plan = planExport({ x: 0, y: 0, width: EXPORT_MAX_DIMENSION * 4, height: 10 })

    expect(Math.max(plan.imageWidth, plan.imageHeight)).toBeLessThanOrEqual(EXPORT_MAX_DIMENSION)
  })
})

describe('exportFilename', () => {
  it('uses the matching extension', () => {
    expect(exportFilename('png')).toBe('floo-flowchart.png')
    expect(exportFilename('jpeg')).toBe('floo-flowchart.jpg')
  })
})

describe('inlineEdgeStrokeStyles', () => {
  function createPath(initialStyle: string | null) {
    const applied = new Map<string, string>()
    let style = initialStyle
    return {
      applied,
      getStyleAttr: () => style,
      getAttribute(name: string) {
        return name === 'style' ? style : null
      },
      setAttribute(name: string, value: string) {
        if (name === 'style') style = value
      },
      removeAttribute(name: string) {
        if (name === 'style') style = null
      },
      style: {
        setProperty(property: string, value: string) {
          applied.set(property, value)
          style = style === null ? `${property}: ${value}` : `${style}; ${property}: ${value}`
        },
      },
    }
  }

  function computedFrom(values: Record<string, string>) {
    return { getPropertyValue: (name: string) => values[name] ?? '' }
  }

  it('writes computed stroke properties as inline styles', () => {
    const path = createPath('fill: none')
    const computed = computedFrom({
      stroke: 'rgb(177, 177, 183)',
      'stroke-width': '1px',
      'stroke-dasharray': 'none',
      'stroke-dashoffset': '0px',
      'stroke-linecap': 'butt',
      'stroke-linejoin': 'miter',
      'stroke-opacity': '1',
    })

    inlineEdgeStrokeStyles([path], () => computed)

    expect(path.applied.get('stroke')).toBe('rgb(177, 177, 183)')
    expect(path.applied.get('stroke-width')).toBe('1px')
    expect(path.applied.get('stroke-opacity')).toBe('1')
    expect(path.getStyleAttr()).toContain('fill: none')
  })

  it('leaves properties with empty computed values untouched', () => {
    const path = createPath('fill: none')

    inlineEdgeStrokeStyles([path], () => computedFrom({}))

    expect(path.applied.size).toBe(0)
    expect(path.getStyleAttr()).toBe('fill: none')
  })

  it('restores the original style attribute', () => {
    const path = createPath('fill: none')

    const restore = inlineEdgeStrokeStyles([path], () => computedFrom({ stroke: 'red' }))
    expect(path.getStyleAttr()).toContain('stroke')
    expect(path.getStyleAttr()).not.toBe('fill: none')

    restore()
    expect(path.getStyleAttr()).toBe('fill: none')
  })

  it('removes the style attribute when the path had none before', () => {
    const path = createPath(null)

    const restore = inlineEdgeStrokeStyles([path], () => computedFrom({ stroke: 'red' }))
    expect(path.getStyleAttr()).not.toBe(null)

    restore()
    expect(path.getStyleAttr()).toBe(null)
  })

  it('is a no-op when there are no edge paths', () => {
    const restore = inlineEdgeStrokeStyles([], () => computedFrom({ stroke: 'red' }))
    restore()
  })
})
