import { useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

import { hexToRgb, hsvToHex, hueColor, normalizeHex, rgbToHsv, type Hsv } from '../lib/color'

interface ColorPickerProps {
  value: string
  onChange: (hex: string) => void
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(hexToRgb(value) ?? { r: 0, g: 0, b: 0 }))
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)

  // Keep the square's backdrop in step with the hue slider.
  const apply = (next: Hsv) => {
    setHsv(next)
    onChange(hsvToHex(next))
  }

  const onSvPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = svRef.current
    if (!el) return
    if (e.type === 'pointerdown') el.setPointerCapture(e.pointerId)
    const r = el.getBoundingClientRect()
    apply({
      ...hsv,
      s: clamp01((e.clientX - r.left) / r.width),
      v: clamp01(1 - (e.clientY - r.top) / r.height),
    })
  }

  const onHuePointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = hueRef.current
    if (!el) return
    if (e.type === 'pointerdown') el.setPointerCapture(e.pointerId)
    const r = el.getBoundingClientRect()
    apply({ ...hsv, h: clamp01((e.clientX - r.left) / r.width) * 360 })
  }

  const onSvKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    const delta = move[e.key]
    if (!delta) return
    e.preventDefault()
    apply({
      ...hsv,
      s: clamp01(hsv.s + delta[0]),
      v: clamp01(hsv.v + delta[1]),
    })
  }

  const onHueKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const step = e.shiftKey ? 30 : 5
    apply({ ...hsv, h: (hsv.h + (e.key === 'ArrowRight' ? step : -step) + 360) % 360 })
  }

  return (
    <div className="floo-picker">
      <div
        ref={svRef}
        className="floo-picker__sv nodrag nopan"
        style={{ background: hueColor(hsv.h) }}
        role="slider"
        tabIndex={0}
        aria-label="Saturation and brightness"
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`${Math.round(hsv.s * 100)}% saturation, ${Math.round(hsv.v * 100)}% brightness`}
        onPointerDown={onSvPointer}
        onPointerMove={(e) => {
          if (e.buttons === 1) onSvPointer(e)
        }}
        onKeyDown={onSvKey}
      >
        <span className="floo-picker__sv-white" />
        <span className="floo-picker__sv-black" />
        <span
          className="floo-picker__cursor"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>
      <div
        ref={hueRef}
        className="floo-picker__hue nodrag nopan"
        role="slider"
        tabIndex={0}
        aria-label="Hue"
        aria-valuenow={Math.round(hsv.h)}
        onPointerDown={onHuePointer}
        onPointerMove={(e) => {
          if (e.buttons === 1) onHuePointer(e)
        }}
        onKeyDown={onHueKey}
      >
        <span className="floo-picker__cursor" style={{ left: `${(hsv.h / 360) * 100}%` }} />
      </div>
      <div className="floo-picker__foot">
        <span className="floo-picker__preview" style={{ background: value }} />
        <input
          className="floo-picker__hex nodrag nopan"
          value={value}
          spellCheck={false}
          aria-label="Hex colour"
          onChange={(e) => {
            const hex = normalizeHex(e.target.value)
            if (hex) {
              setHsv(rgbToHsv(hexToRgb(hex)!))
              onChange(hex)
            }
          }}
        />
      </div>
    </div>
  )
}
