import type { MemorialEntry } from './types'

type OnResults = (entries: MemorialEntry[]) => void

const searchListeners = new WeakMap<HTMLInputElement, () => void>()

export function setupSearch(all: MemorialEntry[], onResults: OnResults) {
  const searchInput = document.getElementById('search-input') as HTMLInputElement
  if (!searchInput) return

  // Remove existing listener to avoid duplicates if re-setup
  const oldListener = searchListeners.get(searchInput)
  if (oldListener) {
    searchInput.removeEventListener('input', oldListener)
  }

  const newApply = () => {
    const q = (searchInput.value ?? '').trim().toLowerCase()
    
    const res = all.filter((e) => {
      // Allow searching for unverified memorials in search if they are in the list
      const matchesQ =
        !q ||
        (e.name || '').toLowerCase().includes(q) ||
        (e.name_fa || '').toLowerCase().includes(q) ||
        (e.city || '').toLowerCase().includes(q) ||
        (e.city_fa || '').toLowerCase().includes(q) ||
        (e.location || '').toLowerCase().includes(q) ||
        (e.location_fa || '').toLowerCase().includes(q) ||
        (e.bio || '').toLowerCase().includes(q) ||
        (e.bio_fa || '').toLowerCase().includes(q)
      
      return matchesQ
    })
    
    onResults(res)
  }

  searchInput.addEventListener('input', newApply)
  searchListeners.set(searchInput, newApply)
  
  newApply()
}

