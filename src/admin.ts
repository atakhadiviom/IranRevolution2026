function generateId(name: string, date: string) {
  const base = `${name}-${date}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return base
}

function normalizeUrl(url?: string) {
  if (!url) return undefined
  try {
    const u = new URL(url)
    return u.toString()
  } catch {
    return undefined
  }
}

document.getElementById('entry-form')!.addEventListener('submit', (ev) => {
  ev.preventDefault()
  const name = (document.getElementById('name') as HTMLInputElement).value.trim()
  const name_fa = (document.getElementById('name_fa') as HTMLInputElement).value.trim()
  const city = (document.getElementById('city') as HTMLInputElement).value.trim()
  const city_fa = (document.getElementById('city_fa') as HTMLInputElement).value.trim()
  const location = (document.getElementById('location') as HTMLInputElement).value.trim()
  const location_fa = (document.getElementById('location_fa') as HTMLInputElement).value.trim()
  const date = (document.getElementById('date') as HTMLInputElement).value
  const lat = Number((document.getElementById('lat') as HTMLInputElement).value)
  const lon = Number((document.getElementById('lon') as HTMLInputElement).value)
  const bio = (document.getElementById('bio') as HTMLTextAreaElement).value.trim()
  const bio_fa = (document.getElementById('bio_fa') as HTMLTextAreaElement).value.trim()
  const testimonialsRaw = (document.getElementById('testimonials') as HTMLTextAreaElement).value.trim()
  const testimonialsFaRaw = (document.getElementById('testimonials_fa') as HTMLTextAreaElement).value.trim()
  const photo = normalizeUrl((document.getElementById('photo') as HTMLInputElement).value)
  const video = normalizeUrl((document.getElementById('video') as HTMLInputElement).value)
  const xPost = normalizeUrl((document.getElementById('xPost') as HTMLInputElement).value)
  const referencesRaw = (document.getElementById('references') as HTMLTextAreaElement).value.trim()

  if (!name || !city || !location || !date || isNaN(lat) || isNaN(lon)) {
    alert('Please fill all required fields.')
    return
  }

  const references = referencesRaw ? referencesRaw.split('\n').map(line => {
    const [label, url] = line.split('|').map(s => s.trim())
    if (label && url) return { label, url }
    return null
  }).filter(Boolean) : undefined

  const entry = {
    id: generateId(name, date),
    name,
    name_fa: name_fa || undefined,
    city,
    city_fa: city_fa || undefined,
    location,
    location_fa: location_fa || undefined,
    date,
    coords: { lat, lon },
    bio: bio || undefined,
    bio_fa: bio_fa || undefined,
    testimonials: testimonialsRaw ? testimonialsRaw.split('\n').map((s) => s.trim()).filter(Boolean) : undefined,
    testimonials_fa: testimonialsFaRaw ? testimonialsFaRaw.split('\n').map((s) => s.trim()).filter(Boolean) : undefined,
    media: photo || video || xPost ? { photo, video, xPost } : undefined,
    references: references && references.length > 0 ? references : undefined
  }
  const out = document.getElementById('output')!
  out.textContent = JSON.stringify(entry, null, 2)
})

document.getElementById('download')!.addEventListener('click', () => {
  const out = document.getElementById('output')!.textContent
  if (!out) {
    alert('Generate JSON first.')
    return
  }
  const blob = new Blob([out], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'memorial-entry.json'
  a.click()
  URL.revokeObjectURL(url)
})

