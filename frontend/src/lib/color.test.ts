import { describe, expect, it } from 'vitest'

import {
  hexToRgb,
  hsvToHex,
  hsvToRgb,
  hueColor,
  normalizeHex,
  rgbToHex,
  rgbToHsv,
} from './color'

describe('normalizeHex', () => {
  it('expands shorthand and lowercases', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc')
    expect(normalizeHex('  #9333ea ')).toBe('#9333ea')
    expect(normalizeHex('9333EA')).toBe('#9333ea')
  })

  it('rejects anything else', () => {
    expect(normalizeHex('#12345')).toBeNull()
    expect(normalizeHex('rebeccapurple')).toBeNull()
    expect(normalizeHex('#gggggg')).toBeNull()
  })
})

describe('hexToRgb / rgbToHex', () => {
  it('parses channels', () => {
    expect(hexToRgb('#9333ea')).toEqual({ r: 147, g: 51, b: 234 })
    expect(hexToRgb('nope')).toBeNull()
  })

  it('pads single-digit channels', () => {
    expect(rgbToHex({ r: 0, g: 8, b: 255 })).toBe('#0008ff')
  })

  it('clamps out-of-range channels', () => {
    expect(rgbToHex({ r: -20, g: 300, b: 12.6 })).toBe('#00ff0d')
  })
})

describe('hsvToRgb', () => {
  it('maps the hue wheel', () => {
    expect(hsvToRgb({ h: 0, s: 1, v: 1 })).toEqual({ r: 255, g: 0, b: 0 })
    expect(hsvToRgb({ h: 120, s: 1, v: 1 })).toEqual({ r: 0, g: 255, b: 0 })
    expect(hsvToRgb({ h: 240, s: 1, v: 1 })).toEqual({ r: 0, g: 0, b: 255 })
  })

  it('treats zero saturation as grey', () => {
    expect(hsvToRgb({ h: 200, s: 0, v: 0.5 })).toEqual({ r: 128, g: 128, b: 128 })
  })

  it('wraps hue outside 0-360', () => {
    expect(hsvToRgb({ h: 360, s: 1, v: 1 })).toEqual(hsvToRgb({ h: 0, s: 1, v: 1 }))
    expect(hsvToRgb({ h: -120, s: 1, v: 1 })).toEqual(hsvToRgb({ h: 240, s: 1, v: 1 }))
  })
})

describe('rgbToHsv', () => {
  it('reads primaries', () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 }).h).toBeCloseTo(0)
    expect(rgbToHsv({ r: 0, g: 255, b: 0 }).h).toBeCloseTo(120)
    expect(rgbToHsv({ r: 0, g: 0, b: 255 }).h).toBeCloseTo(240)
  })

  it('reports zero saturation for black', () => {
    expect(rgbToHsv({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, v: 0 })
  })

  it('wraps a negative hue into 0-360', () => {
    const h = rgbToHsv({ r: 255, g: 0, b: 40 }).h
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThan(360)
  })
})

describe('round trips', () => {
  const samples = ['#9333ea', '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#7f7f7f']

  it('survives hsv -> hex -> hsv within rounding', () => {
    for (const hex of samples) {
      const back = hsvToHex(rgbToHsv(hexToRgb(hex)!))
      expect(back).toBe(hex)
    }
  })

  it('survives hex -> hsv -> hex', () => {
    for (const hex of samples) {
      expect(hsvToHex(rgbToHsv(hexToRgb(hex)!))).toBe(hex)
    }
  })
})

describe('hueColor', () => {
  it('is fully saturated at any hue', () => {
    for (const h of [0, 45, 137, 271, 359]) {
      expect(rgbToHsv(hexToRgb(hueColor(h))!).s).toBeCloseTo(1)
    }
  })
})
