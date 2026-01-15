import { supabase } from './modules/supabase'
import { 
  fetchMemorials, 
  verifyMemorial, 
  deleteMemorial, 
  submitMemorial, 
  batchUpdateImages, 
  batchTranslateMemorials, 
  batchSyncLocationCoords 
} from './modules/dataService'
import { extractMemorialData, geocodeLocation } from './modules/ai'
import { extractXPostImage } from './modules/imageExtractor'
import type { MemorialEntry } from './modules/types'

// DOM Elements - Sections
const loginSection = document.getElementById('login-section') as HTMLDivElement
const adminSection = document.getElementById('admin-section') as HTMLDivElement
const sections = {
  overview: document.getElementById('section-overview') as HTMLElement,
  submissions: document.getElementById('section-submissions') as HTMLElement,
  memorials: document.getElementById('section-memorials') as HTMLElement,
  editor: document.getElementById('section-editor') as HTMLElement
}

// DOM Elements - Nav
const navLinks = {
  overview: document.getElementById('nav-overview') as HTMLDivElement,
  submissions: document.getElementById('nav-submissions') as HTMLDivElement,
  memorials: document.getElementById('nav-memorials') as HTMLDivElement,
  editor: document.getElementById('nav-editor') as HTMLDivElement
}

// DOM Elements - Stats
const statTotal = document.getElementById('stat-total') as HTMLDivElement
const statVerified = document.getElementById('stat-verified') as HTMLDivElement
const statPending = document.getElementById('stat-pending') as HTMLDivElement
const refreshStatsBtn = document.getElementById('refresh-stats-btn') as HTMLButtonElement

// DOM Elements - Lists
const submissionsList = document.getElementById('submissions-list') as HTMLTableSectionElement
const verifiedList = document.getElementById('verified-list') as HTMLTableSectionElement
const recentList = document.getElementById('recent-list') as HTMLTableSectionElement
const searchSubmissions = document.getElementById('search-submissions') as HTMLInputElement
const searchMemorials = document.getElementById('search-memorials') as HTMLInputElement

// DOM Elements - Auth
const loginForm = document.getElementById('login-form') as HTMLFormElement
const loginError = document.getElementById('login-error') as HTMLParagraphElement
const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement
const userEmailSpan = document.getElementById('user-email') as HTMLSpanElement

// DOM Elements - Form
const entryForm = document.getElementById('entry-form') as HTMLFormElement
const editIdInput = document.getElementById('edit-id') as HTMLInputElement
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement
const output = document.getElementById('output') as HTMLPreElement
const editorTitle = document.getElementById('editor-title') as HTMLHeadingElement

// DOM Elements - Quick Import
const aiUrlInput = document.getElementById('ai-url') as HTMLInputElement
const aiExtractBtn = document.getElementById('ai-extract-btn') as HTMLButtonElement
const extractImgBtn = document.getElementById('extract-img-btn') as HTMLButtonElement
const syncCoordsBtn = document.getElementById('sync-coords-btn') as HTMLButtonElement
const batchImgBtn = document.getElementById('batch-img-btn') as HTMLButtonElement
const batchTranslateBtn = document.getElementById('batch-translate-btn') as HTMLButtonElement
const batchCoordsBtn = document.getElementById('batch-coords-btn') as HTMLButtonElement
const aiStatus = document.getElementById('ai-status') as HTMLDivElement
const jsonImportArea = document.getElementById('json-import') as HTMLTextAreaElement
const jsonImportBtn = document.getElementById('json-import-btn') as HTMLButtonElement

let allMemorials: MemorialEntry[] = []

// --- Auth Logic ---

async function checkUser() {
  if (!supabase) {
    loginError.textContent = 'Supabase connection is not configured. Please check your environment variables.'
    loginError.classList.remove('hidden')
    showLogin()
    return
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    showAdmin(user.email || '')
  } else {
    showLogin()
  }
}

function showLogin() {
  loginSection.classList.remove('hidden')
  adminSection.classList.add('hidden')
}

function showAdmin(email: string) {
  loginSection.classList.add('hidden')
  adminSection.classList.remove('hidden')
  userEmailSpan.textContent = email
  loadData()
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  if (!supabase) {
    loginError.textContent = 'Supabase connection is not configured.'
    loginError.classList.remove('hidden')
    return
  }
  const email = (document.getElementById('email') as HTMLInputElement).value
  const password = (document.getElementById('password') as HTMLInputElement).value
  
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    loginError.textContent = error.message
    loginError.classList.remove('hidden')
  } else {
    checkUser()
  }
})

logoutBtn.addEventListener('click', async () => {
  if (supabase) {
    await supabase.auth.signOut()
  }
  showLogin()
})

// --- Navigation Logic ---

function showSection(sectionName: keyof typeof sections) {
  // Hide all sections
  Object.values(sections).forEach(s => s.classList.add('hidden'))
  // Show target section
  sections[sectionName].classList.remove('hidden')
  
  // Update nav links
  Object.entries(navLinks).forEach(([name, link]) => {
    if (name === sectionName) {
      link.classList.add('active')
    } else {
      link.classList.remove('active')
    }
  })
}

Object.entries(navLinks).forEach(([name, link]) => {
  link.addEventListener('click', () => showSection(name as keyof typeof sections))
})

// --- Dashboard Logic ---

async function loadData() {
  const loadingHtml = '<tr><td colspan="5" style="text-align: center; color: var(--muted); padding: 2rem;">Loading data...</td></tr>'
  submissionsList.innerHTML = loadingHtml
  verifiedList.innerHTML = loadingHtml
  recentList.innerHTML = loadingHtml
  
  allMemorials = await fetchMemorials(true)
  updateStats()
  renderSubmissions()
  renderVerified()
  renderRecent()
}

function updateStats() {
  const verified = allMemorials.filter(m => m.verified)
  const pending = allMemorials.filter(m => !m.verified)
  
  statTotal.textContent = allMemorials.length.toString()
  statVerified.textContent = verified.length.toString()
  statPending.textContent = pending.length.toString()
}

function renderSubmissions() {
  const query = searchSubmissions.value.toLowerCase()
  const filtered = allMemorials
    .filter(m => !m.verified)
    .filter(m => 
      m.name.toLowerCase().includes(query) || 
      (m.name_fa && m.name_fa.includes(query)) ||
      m.city.toLowerCase().includes(query)
    )
    
  renderTable(filtered, submissionsList)
}

function renderVerified() {
  const query = searchMemorials.value.toLowerCase()
  const filtered = allMemorials
    .filter(m => m.verified)
    .filter(m => 
      m.name.toLowerCase().includes(query) || 
      (m.name_fa && m.name_fa.includes(query)) ||
      m.city.toLowerCase().includes(query)
    )
    
  renderTable(filtered, verifiedList)
}

function renderRecent() {
  const recent = [...allMemorials]
    .sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
      return dateB - dateA
    })
    .slice(0, 5)

  if (recent.length === 0) {
    recentList.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--muted); padding: 1rem;">No activity yet.</td></tr>'
    return
  }

  recentList.innerHTML = recent.map(m => `
    <tr>
      <td><div style="font-weight: 600;">${m.name}</div></td>
      <td>${m.city}</td>
      <td style="font-size: 0.85rem; color: var(--muted);">${m.created_at ? new Date(m.created_at).toLocaleDateString() : 'Unknown'}</td>
      <td>
        <span class="badge ${m.verified ? 'badge-verified' : 'badge-pending'}">
          ${m.verified ? 'Verified' : 'Pending'}
        </span>
      </td>
    </tr>
  `).join('')
}

function renderTable(memorials: MemorialEntry[], container: HTMLTableSectionElement) {
  if (memorials.length === 0) {
    container.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--muted); padding: 2rem;">No entries found.</td></tr>'
    return
  }

  container.innerHTML = memorials.map(m => `
    <tr class="data-row">
      <td>
        <div style="font-weight: 600;">${m.name}</div>
        <div style="font-size: 0.8rem; color: var(--muted);" dir="rtl">${m.name_fa || ''}</div>
      </td>
      <td>${m.city}</td>
      <td>${m.date}</td>
      <td>
        <span class="badge ${m.verified ? 'badge-verified' : 'badge-pending'}">
          ${m.verified ? 'Verified' : 'Pending'}
        </span>
      </td>
      <td>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-secondary btn-sm edit-btn" data-id="${m.id}">Edit</button>
          ${!m.verified ? `<button class="btn btn-primary btn-sm verify-btn" data-id="${m.id}">Verify</button>` : ''}
          <button class="btn btn-danger btn-sm delete-btn" data-id="${m.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('')

  // Add event listeners
  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => editEntry((btn as HTMLButtonElement).dataset.id!))
  })
  container.querySelectorAll('.verify-btn').forEach(btn => {
    btn.addEventListener('click', () => handleVerify((btn as HTMLButtonElement).dataset.id!))
  })
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => handleDelete((btn as HTMLButtonElement).dataset.id!))
  })
}

function editEntry(id: string) {
  const entry = allMemorials.find(m => m.id === id)
  if (!entry) return

  editIdInput.value = entry.id || ''
  editorTitle.textContent = `Edit: ${entry.name}`
  
  ;(document.getElementById('name') as HTMLInputElement).value = entry.name
  ;(document.getElementById('name_fa') as HTMLInputElement).value = entry.name_fa || ''
  ;(document.getElementById('city') as HTMLInputElement).value = entry.city
  ;(document.getElementById('city_fa') as HTMLInputElement).value = entry.city_fa || ''
  ;(document.getElementById('location') as HTMLInputElement).value = entry.location || ''
  ;(document.getElementById('location_fa') as HTMLInputElement).value = entry.location_fa || ''
  ;(document.getElementById('date') as HTMLInputElement).value = entry.date
  ;(document.getElementById('lat') as HTMLInputElement).value = (entry.coords?.lat || 35.6892).toString()
  ;(document.getElementById('lon') as HTMLInputElement).value = (entry.coords?.lon || 51.3890).toString()
  ;(document.getElementById('bio') as HTMLTextAreaElement).value = entry.bio || ''
  ;(document.getElementById('bio_fa') as HTMLTextAreaElement).value = entry.bio_fa || ''
  ;(document.getElementById('testimonials') as HTMLTextAreaElement).value = entry.testimonials?.join('\n') || ''
  ;(document.getElementById('photo') as HTMLInputElement).value = entry.media?.photo || ''
  ;(document.getElementById('xPost') as HTMLInputElement).value = entry.media?.xPost || ''
  ;(document.getElementById('references') as HTMLTextAreaElement).value = 
    entry.references?.map(r => `${r.label} | ${r.url}`).join('\n') || ''
  ;(document.getElementById('verified') as HTMLInputElement).checked = entry.verified || false
  
  output.textContent = JSON.stringify(entry, null, 2)
  showSection('editor')
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

searchSubmissions.addEventListener('input', renderSubmissions)
searchMemorials.addEventListener('input', renderVerified)
refreshStatsBtn.addEventListener('click', loadData)

// --- Quick Import Logic ---

aiExtractBtn.addEventListener('click', async () => {
  const url = aiUrlInput.value.trim()
  if (!url) return

  aiExtractBtn.disabled = true
  aiExtractBtn.textContent = '...'
  aiStatus.textContent = '✨ Extracting data with AI...'
  aiStatus.className = 'loading'
  aiStatus.classList.remove('hidden')

  try {
    const data = await extractMemorialData(url)
    populateForm(data)
    
    // Add reference automatically
    const refsArea = document.getElementById('references') as HTMLTextAreaElement
    const existingRefs = refsArea.value.trim()
    const newRef = `${data.referenceLabel || 'Source'} | ${url}`
    refsArea.value = existingRefs ? `${existingRefs}\n${newRef}` : newRef
    
    if (url.includes('x.com') || url.includes('twitter.com')) {
      (document.getElementById('xPost') as HTMLInputElement).value = url
    }

    // Try to geocode if needed
    const latInput = document.getElementById('lat') as HTMLInputElement
    const lonInput = document.getElementById('lon') as HTMLInputElement
    if (!latInput.value || latInput.value === '35.6892') {
      if (data.city) {
        aiStatus.textContent = '📍 Syncing coordinates...'
        const coords = await geocodeLocation(data.city, data.location || '')
        if (coords) {
          latInput.value = coords.lat.toString()
          lonInput.value = coords.lon.toString()
        }
      }
    }

    aiStatus.textContent = '✅ Extraction successful!'
    aiStatus.className = 'success'
    
    // Switch to editor automatically
    setTimeout(() => {
      showSection('editor')
      aiStatus.classList.add('hidden')
      aiUrlInput.value = ''
    }, 1500)

  } catch (error) {
    aiStatus.textContent = '❌ Extraction failed: ' + (error instanceof Error ? error.message : 'Unknown error')
    aiStatus.className = 'error'
  } finally {
    aiExtractBtn.disabled = false
    aiExtractBtn.textContent = 'Extract'
  }
})

extractImgBtn.addEventListener('click', async () => {
  const url = (document.getElementById('xPost') as HTMLInputElement).value.trim()
  if (!url) {
    alert('Please enter an X Post URL first.')
    return
  }

  extractImgBtn.disabled = true
  extractImgBtn.textContent = '...'
  
  try {
    const imageUrl = await extractXPostImage(url)
    if (imageUrl) {
      (document.getElementById('photo') as HTMLInputElement).value = imageUrl
      alert('Image extracted successfully!')
    } else {
      alert('Could not find an image in this post.')
    }
  } catch (error) {
    alert('Failed to extract image.')
  } finally {
    extractImgBtn.disabled = false
    extractImgBtn.textContent = 'Extract Img'
  }
})

syncCoordsBtn.addEventListener('click', async () => {
  const city = (document.getElementById('city') as HTMLInputElement).value.trim()
  const location = (document.getElementById('location') as HTMLInputElement).value.trim()
  
  if (!city) {
    alert('Please enter a city first.')
    return
  }

  syncCoordsBtn.disabled = true
  
  try {
    const coords = await geocodeLocation(city, location)
    if (coords) {
      (document.getElementById('lat') as HTMLInputElement).value = coords.lat.toString();
      (document.getElementById('lon') as HTMLInputElement).value = coords.lon.toString();
    } else {
      alert('Could not find coordinates for this location.')
    }
  } catch (error) {
    alert('Geocoding failed.')
  } finally {
    syncCoordsBtn.disabled = false
  }
})

batchImgBtn.addEventListener('click', async () => {
  if (!confirm('Sync images for all memorials? This might take a while.')) return
  batchImgBtn.disabled = true
  try {
    const { success, count, error } = await batchUpdateImages()
    if (success) {
      alert(`Successfully updated ${count} memorials!`)
      loadData()
    } else alert(`Failed: ${error}`)
  } catch (e) { alert('Failed.') } finally { batchImgBtn.disabled = false }
})

batchTranslateBtn.addEventListener('click', async () => {
  if (!confirm('Use AI to fix missing translations?')) return
  batchTranslateBtn.disabled = true
  try {
    const { success, count, error } = await batchTranslateMemorials()
    if (success) {
      alert(`Successfully translated ${count} memorials!`)
      loadData()
    } else alert(`Failed: ${error}`)
  } catch (e) { alert('Failed.') } finally { batchTranslateBtn.disabled = false }
})

batchCoordsBtn.addEventListener('click', async () => {
  if (!confirm('Use AI to sync all coordinates?')) return
  batchCoordsBtn.disabled = true
  try {
    const { success, count, error } = await batchSyncLocationCoords()
    if (success) {
      alert(`Successfully synced ${count} memorials!`)
      loadData()
    } else alert(`Failed: ${error}`)
  } catch (e) { alert('Failed.') } finally { batchCoordsBtn.disabled = false }
})

jsonImportBtn.addEventListener('click', async () => {
  const raw = jsonImportArea.value.trim()
  if (!raw) return
  try {
    const data = JSON.parse(raw) as Partial<MemorialEntry>
    if (!data.name || !data.city || !data.date) {
      alert('Error: JSON must contain name, city, and date.')
      return
    }
    data.verified = true
    jsonImportBtn.disabled = true
    const { success, error } = await submitMemorial(data)
    if (success) {
      jsonImportArea.value = ''
      alert('Memorial saved successfully!')
      loadData()
    } else alert(`Error: ${error}`)
  } catch (e) { alert('Invalid JSON format.') } finally { jsonImportBtn.disabled = false }
})

function populateForm(data: Partial<MemorialEntry> & { referenceLabel?: string; photo?: string }) {
  const fields: Record<string, string | number | undefined> = {
    name: data.name,
    name_fa: data.name_fa,
    city: data.city,
    city_fa: data.city_fa,
    location: data.location,
    location_fa: data.location_fa,
    date: data.date,
    lat: data.coords?.lat,
    lon: data.coords?.lon,
    bio: data.bio,
    bio_fa: data.bio_fa,
    photo: data.media?.photo || data.photo,
    xPost: data.media?.xPost
  }

  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement
    if (el && val !== undefined) el.value = val.toString()
  })

  if (Array.isArray(data.testimonials)) {
    (document.getElementById('testimonials') as HTMLTextAreaElement).value = data.testimonials.join('\n')
  }
  if (Array.isArray(data.references)) {
    (document.getElementById('references') as HTMLTextAreaElement).value = 
      data.references.map((r) => `${r.label} | ${r.url}`).join('\n')
  }
}

async function handleVerify(id: string) {
  if (!confirm('Verify this entry?')) return
  const { success, error } = await verifyMemorial(id)
  if (success) {
    alert('Verified!')
    loadData()
  } else alert(`Error: ${error}`)
}

async function handleDelete(id: string) {
  if (!confirm('Delete this entry?')) return
  const { success, error } = await deleteMemorial(id)
  if (success) {
    alert('Deleted!')
    loadData()
  } else alert(`Error: ${error}`)
}

entryForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const name = (document.getElementById('name') as HTMLInputElement).value.trim()
  const xPost = (document.getElementById('xPost') as HTMLInputElement).value.trim()
  const rawRefs = (document.getElementById('references') as HTMLTextAreaElement).value.trim()
  
  const references = rawRefs.split('\n').map(line => {
    const [label, url] = line.split('|').map(s => s.trim())
    return (label && url) ? { label, url } : null
  }).filter(Boolean) as { label: string, url: string }[]

  if (!name || (!xPost && references.length === 0)) {
    alert('Name and at least one link required.')
    return
  }

  const entry: Partial<MemorialEntry> = {
    id: editIdInput.value || undefined,
    name,
    name_fa: (document.getElementById('name_fa') as HTMLInputElement).value.trim() || undefined,
    city: (document.getElementById('city') as HTMLInputElement).value.trim(),
    city_fa: (document.getElementById('city_fa') as HTMLInputElement).value.trim() || undefined,
    location: (document.getElementById('location') as HTMLInputElement).value.trim() || undefined,
    location_fa: (document.getElementById('location_fa') as HTMLInputElement).value.trim() || undefined,
    date: (document.getElementById('date') as HTMLInputElement).value,
    coords: {
      lat: Number((document.getElementById('lat') as HTMLInputElement).value),
      lon: Number((document.getElementById('lon') as HTMLInputElement).value)
    },
    bio: (document.getElementById('bio') as HTMLTextAreaElement).value.trim() || undefined,
    bio_fa: (document.getElementById('bio_fa') as HTMLTextAreaElement).value.trim() || undefined,
    testimonials: (document.getElementById('testimonials') as HTMLTextAreaElement).value.trim()
      .split('\n').map(s => s.trim()).filter(Boolean),
    media: {
      photo: (document.getElementById('photo') as HTMLInputElement).value.trim() || undefined,
      xPost: xPost || undefined
    },
    references: references.length > 0 ? references : undefined,
    verified: (document.getElementById('verified') as HTMLInputElement).checked
  }

  output.textContent = JSON.stringify(entry, null, 2)
  const { success, error } = await submitMemorial(entry)
  if (success) {
    alert('Saved successfully!')
    clearForm()
    loadData()
    showSection('overview')
  } else alert(`Error: ${error}`)
})

function clearForm() {
  entryForm.reset()
  editIdInput.value = ''
  editorTitle.textContent = 'Add Memorial Entry'
  output.textContent = ''
  ;(document.getElementById('lat') as HTMLInputElement).value = '35.6892'
  ;(document.getElementById('lon') as HTMLInputElement).value = '51.3890'
}

clearBtn.addEventListener('click', clearForm)

// Initialize
checkUser()
