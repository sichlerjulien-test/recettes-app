import { describe, expect, it } from 'vitest'
import { normalizeRawInput } from './number-field'

describe('normalizeRawInput', () => {
  it("vider → '' et non 0 (discriminant anti-régression NaN→0)", () => {
    const result = normalizeRawInput('')
    expect(result).toBe('')
    expect(result).not.toBe(0)
  })

  it('"03" → 3 (leading zero)', () => {
    expect(normalizeRawInput('03')).toBe(3)
  })

  it('non-numérique → "" (discriminant anti-régression NaN→0)', () => {
    const result = normalizeRawInput('abc')
    expect(result).toBe('')
    expect(result).not.toBe(0)
  })

  it('"3abc" → 3 (parseInt s\'arrête au premier caractère non numérique)', () => {
    expect(normalizeRawInput('3abc')).toBe(3)
  })

  it('"5" → 5', () => {
    expect(normalizeRawInput('5')).toBe(5)
  })

  it('"42" → 42', () => {
    expect(normalizeRawInput('42')).toBe(42)
  })
})
