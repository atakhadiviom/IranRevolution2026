import { describe, it, expect } from 'vitest'
import type { MemorialEntry } from '../types'

function filter(all: MemorialEntry[], q: string, city?: string, year?: number) {
  const query = q.trim().toLowerCase()
  const cityQ = (city ?? '').trim().toLowerCase()
  return all.filter((e) => {
    const matchesQ =
      !query ||
      e.name.toLowerCase().includes(query) ||
      e.city.toLowerCase().includes(query) ||
      e.location.toLowerCase().includes(query) ||
      (e.bio ?? '').toLowerCase().includes(query)
    const matchesCity = !cityQ || e.city.toLowerCase().includes(cityQ)
    const matchesYear = !year || new Date(e.date).getFullYear() === year
    return matchesQ && matchesCity && matchesYear
  })
}

describe('search filter', () => {
  const data: MemorialEntry[] = [
    { id: '1', name: 'Ali', city: 'Tehran', location: 'Tehran', date: '2022-11-01', coords: { lat: 35.6, lon: 51.4 } },
    { id: '2', name: 'Sara', city: 'Shiraz', location: 'Shiraz', date: '2022-10-01', coords: { lat: 29.5, lon: 52.5 } },
  ]

  it('matches by name', () => {
    expect(filter(data, 'ali').length).toBe(1)
  })

  it('filters by city', () => {
    expect(filter(data, '', 'shiraz').length).toBe(1)
  })

  it('filters by year', () => {
    expect(filter(data, '', '', 2022).length).toBe(2)
    expect(filter(data, '', '', 2023).length).toBe(0)
  })
})
