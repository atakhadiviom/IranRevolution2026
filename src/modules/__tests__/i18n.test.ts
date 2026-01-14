import { describe, it, expect } from 'vitest'

function t(dict: Record<string, string>, key: string, params?: Record<string, string>) {
  let v = dict[key] ?? key
  if (params) {
    for (const [k, val] of Object.entries(params)) {
      v = v.replaceAll(`{${k}}`, val)
    }
  }
  return v
}

describe('i18n interpolation', () => {
  it('replaces parameters', () => {
    const d = { 'details.photoAlt': "Photo of {name}" }
    expect(t(d, 'details.photoAlt', { name: 'Ali' })).toBe('Photo of Ali')
  })
})
