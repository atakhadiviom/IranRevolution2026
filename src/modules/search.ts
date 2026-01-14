import type { MemorialEntry } from './types'

type OnResults = (entries: MemorialEntry[]) => void

export function setupSearch(all: MemorialEntry[], onResults: OnResults) {
  const searchInput = document.getElementById('search-input') as HTMLInputElement

  function apply() {
    const q = (searchInput?.value ?? '').trim().toLowerCase()

    const res = all.filter((e) => {
      const matchesQ =
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.city.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        (e.bio ?? '').toLowerCase().includes(q)
      return matchesQ
    })
    onResults(res)
  }

  searchInput?.addEventListener('input', apply)
  apply()
}

