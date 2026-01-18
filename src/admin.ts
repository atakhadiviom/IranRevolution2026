import { supabase } from './modules/supabase'
import { 
  fetchMemorials, 
  verifyMemorial, 
  deleteMemorial, 
  submitMemorial, 
  mergeMemorials,
  batchUpdateImages, 
  batchTranslateMemorials, 
  batchSyncLocationCoords,
  fetchReports,
  updateReportStatus
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
  editor: document.getElementById('section-editor') as HTMLElement,
  reports: document.getElementById('section-reports') as HTMLElement
}

// DOM Elements - Nav
const navLinks = {
  overview: document.getElementById('nav-overview') as HTMLDivElement,
  submissions: document.getElementById('nav-submissions') as HTMLDivElement,
  memorials: document.getElementById('nav-memorials') as HTMLDivElement,
  editor: document.getElementById('nav-editor') as HTMLDivElement,
  reports: document.getElementById('nav-reports') as HTMLDivElement
}

// DOM Elements - Stats
const statTotal = document.getElementById('stat-total') as HTMLDivElement
const statVerified = document.getElementById('stat-verified') as HTMLDivElement
const statPending = document.getElementById('stat-pending') as HTMLDivElement
const statReports = document.getElementById('stat-reports') as HTMLDivElement
const refreshStatsBtn = document.getElementById('refresh-stats-btn') as HTMLButtonElement

// DOM Elements - Lists
const submissionsList = document.getElementById('submissions-list') as HTMLTableSectionElement
const verifiedList = document.getElementById('verified-list') as HTMLTableSectionElement
const recentList = document.getElementById('recent-list') as HTMLTableSectionElement
const searchSubmissions = document.getElementById('search-submissions') as HTMLInputElement
const searchMemorials = document.getElementById('search-memorials') as HTMLInputElement
const sortSubmissions = document.getElementById('sort-submissions') as HTMLSelectElement
const sortMemorials = document.getElementById('sort-memorials') as HTMLSelectElement

// DOM Elements - Reports
const reportsList = document.getElementById('reports-list') as HTMLTableSectionElement
const refreshReportsBtn = document.getElementById('refresh-reports-btn') as HTMLButtonElement

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
const duplicateWarning = document.getElementById('duplicate-warning') as HTMLDivElement
const editorStatus = document.getElementById('editor-status') as HTMLDivElement
const deleteEntryBtn = document.getElementById('delete-entry-btn') as HTMLButtonElement
const mergeEntryBtn = document.getElementById('merge-entry-btn') as HTMLButtonElement
const translateEntryBtn = document.getElementById('translate-entry-btn') as HTMLButtonElement

// Merge Modal Elements
const mergeModal = document.getElementById('merge-modal') as HTMLDivElement
const mergeModalTitle = document.getElementById('merge-modal-title') as HTMLHeadingElement
const mergeTargetSearch = document.getElementById('merge-target-search') as HTMLInputElement
const mergeTargetResults = document.getElementById('merge-target-results') as HTMLDivElement
const cancelMergeBtn = document.getElementById('cancel-merge') as HTMLButtonElement
const confirmMergeBtn = document.getElementById('confirm-merge') as HTMLButtonElement

let currentSourceId: string | null = null
let currentTargetId: string | null = null

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

refreshReportsBtn.addEventListener('click', handleRefreshReports)

async function loadData() {
  const loadingHtml = '<tr><td colspan="5" style="text-align: center; color: var(--muted); padding: 2rem;">Loading data...</td></tr>'
  submissionsList.innerHTML = loadingHtml
  verifiedList.innerHTML = loadingHtml
  recentList.innerHTML = loadingHtml
  
  allMemorials = await fetchMemorials(true)
  await updateStats()
  renderSubmissions()
  renderVerified()
  renderRecent()
  renderReports()
}

async function handleRefreshReports() {
  refreshReportsBtn.disabled = true
  refreshReportsBtn.textContent = 'Loading...'
  await renderReports()
  await updateStats()
  refreshReportsBtn.disabled = false
  refreshReportsBtn.textContent = 'Refresh Reports'
}

async function renderReports() {
  const { data: reports, error } = await fetchReports()
  
  if (error) {
    reportsList.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger); padding: 2rem;">Error loading reports: ${error}</td></tr>`
    return
  }
  
  if (reports.length === 0) {
    reportsList.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 2rem;">No reports found.</td></tr>'
    return
  }

  reportsList.innerHTML = reports.map(r => `
    <tr class="data-row">
      <td style="font-size: 0.85rem; color: var(--muted);">${new Date(r.created_at).toLocaleDateString()}</td>
      <td>
        <div style="font-weight: 600;">${r.memorial_name}</div>
        <div style="font-size: 0.75rem; color: var(--muted);">ID: ${r.memorial_id}</div>
      </td>
      <td><span class="badge badge-pending">${r.reason}</span></td>
      <td style="max-width: 300px; font-size: 0.9rem;">${r.details || '<span style="color:var(--muted)">No details</span>'}</td>
      <td>
        <span class="badge ${r.status === 'resolved' ? 'badge-verified' : r.status === 'dismissed' ? 'badge-muted' : 'badge-pending'}">
          ${r.status || 'pending'}
        </span>
      </td>
      <td>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-primary btn-sm view-memorial-btn" data-id="${r.memorial_id}">View</button>
          ${r.status !== 'resolved' ? `<button class="btn btn-secondary btn-sm resolve-report-btn" data-id="${r.id}">Resolve</button>` : ''}
          <button class="btn btn-danger btn-sm delete-report-btn" data-id="${r.id}">Dismiss</button>
        </div>
      </td>
    </tr>
  `).join('')

  reportsList.querySelectorAll('.view-memorial-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLButtonElement).dataset.id!
      editEntry(id)
      showSection('editor')
    })
  })

  reportsList.querySelectorAll('.resolve-report-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLButtonElement).dataset.id!
      const originalText = btn.textContent
      btn.textContent = '...'
      const { success, error } = await updateReportStatus(id, 'resolved')
      if (success) {
        await renderReports()
        await updateStats()
      } else {
        alert('Error updating report status: ' + error)
        btn.textContent = originalText
      }
    })
  })

  reportsList.querySelectorAll('.delete-report-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLButtonElement).dataset.id!
      if (confirm('Are you sure you want to dismiss this report?')) {
        const originalText = btn.textContent
        btn.textContent = '...'
        const { success, error } = await updateReportStatus(id, 'dismissed')
        if (success) {
          await renderReports()
          await updateStats()
        } else {
          alert('Error updating report status: ' + error)
          btn.textContent = originalText
        }
      }
    })
  })
}

async function updateStats() {
  const verified = allMemorials.filter(m => m.verified)
  const pending = allMemorials.filter(m => !m.verified)
  const { data: allReports } = await fetchReports()
  const activeReports = allReports.filter(r => r.status === 'pending' || !r.status)
  
  statTotal.textContent = allMemorials.length.toString()
  statVerified.textContent = verified.length.toString()
  statPending.textContent = pending.length.toString()
  statReports.textContent = activeReports.length.toString()
}

function sortMemorialsList(memorials: MemorialEntry[], sortBy: string) {
  return [...memorials].sort((a, b) => {
    switch (sortBy) {
      case 'date-desc':
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      case 'date-asc':
        return new Date(a.date).getTime() - new Date(b.date).getTime()
      case 'name-asc':
        return a.name.localeCompare(b.name)
      case 'name-desc':
        return b.name.localeCompare(a.name)
      case 'city-asc':
        return a.city.localeCompare(b.city)
      default:
        return 0
    }
  })
}

function renderSubmissions() {
  const query = searchSubmissions.value.toLowerCase()
  const sortBy = sortSubmissions.value
  let filtered = allMemorials
    .filter(m => !m.verified)
    .filter(m => 
      m.name.toLowerCase().includes(query) || 
      (m.name_fa && m.name_fa.includes(query)) ||
      m.city.toLowerCase().includes(query)
    )
  
  filtered = sortMemorialsList(filtered, sortBy)
    
  renderTable(filtered, submissionsList)
}

function renderVerified() {
  const query = searchMemorials.value.toLowerCase()
  const sortBy = sortMemorials.value
  let filtered = allMemorials
    .filter(m => m.verified)
    .filter(m => 
      m.name.toLowerCase().includes(query) || 
      (m.name_fa && m.name_fa.includes(query)) ||
      m.city.toLowerCase().includes(query)
    )
  
  filtered = sortMemorialsList(filtered, sortBy)
    
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
          <button class="btn btn-secondary btn-sm merge-btn" data-id="${m.id}" title="Merge references into another entry">Merge</button>
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
  container.querySelectorAll('.merge-btn').forEach(btn => {
    btn.addEventListener('click', () => openMergeModal((btn as HTMLButtonElement).dataset.id!))
  })
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => handleDelete((btn as HTMLButtonElement).dataset.id!))
  })
}

function openMergeModal(id: string) {
  const source = allMemorials.find(m => m.id === id)
  if (!source) return

  currentSourceId = id
  currentTargetId = null
  mergeModalTitle.textContent = `Merge: ${source.name}`
  mergeTargetSearch.value = source.name // Pre-fill with name to find duplicates
  mergeModal.classList.remove('hidden')
  confirmMergeBtn.disabled = true
  updateMergeResults()
}

function updateMergeResults() {
  const query = mergeTargetSearch.value.toLowerCase().trim()
  const results = allMemorials
    .filter(m => m.id !== currentSourceId)
    .filter(m => 
      m.name.toLowerCase().includes(query) || 
      (m.name_fa && m.name_fa.includes(query)) ||
      m.city.toLowerCase().includes(query)
    )
    .slice(0, 10)

  if (results.length === 0) {
    mergeTargetResults.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--muted);">No matching people found.</div>'
    return
  }

  mergeTargetResults.innerHTML = results.map(m => `
    <div class="merge-result-item ${m.id === currentTargetId ? 'selected' : ''}" 
         data-id="${m.id}" 
         style="padding: 0.75rem; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.2s;">
      <div style="font-weight: 600;">${m.name} ${m.verified ? '✅' : '⏳'}</div>
      <div style="font-size: 0.8rem; color: var(--muted);">${m.city} | ${m.date}</div>
    </div>
  `).join('')

  // Add styles for selection
  const style = document.createElement('style')
  style.textContent = `
    .merge-result-item:hover { background: rgba(255,255,255,0.05); }
    .merge-result-item.selected { background: var(--accent) !important; color: white !important; }
    .merge-result-item.selected .muted { color: rgba(255,255,255,0.8); }
  `
  document.head.appendChild(style)

  mergeTargetResults.querySelectorAll('.merge-result-item').forEach(item => {
    item.addEventListener('click', () => {
      currentTargetId = (item as HTMLDivElement).dataset.id!
      confirmMergeBtn.disabled = false
      updateMergeResults()
    })
  })
}

mergeTargetSearch.addEventListener('input', updateMergeResults)

cancelMergeBtn.addEventListener('click', () => {
  mergeModal.classList.add('hidden')
  currentSourceId = null
  currentTargetId = null
})

confirmMergeBtn.addEventListener('click', async () => {
  if (!currentSourceId || !currentTargetId) return
  
  const source = allMemorials.find(m => m.id === currentSourceId)
  const target = allMemorials.find(m => m.id === currentTargetId)
  
  if (!confirm(`Merge references from "${source?.name}" into "${target?.name}"?\n\nThis will delete the entry for "${source?.name}".`)) {
    return
  }

  confirmMergeBtn.disabled = true
  confirmMergeBtn.textContent = 'Merging...'
  
  const { success, error } = await mergeMemorials(currentSourceId, currentTargetId)
  
  if (success) {
    alert('Merged successfully!')
    mergeModal.classList.add('hidden')
    loadData()
  } else {
    alert(`Error: ${error}`)
  }
  
  confirmMergeBtn.disabled = false
  confirmMergeBtn.textContent = 'Confirm Merge'
})

navLinks.editor.addEventListener('click', () => {
  clearForm()
  editEntry('')
  showSection('editor')
})

function editEntry(id: string) {
  // Show translate button always (for new entries and editing)
  translateEntryBtn.classList.remove('hidden')
  
  if (id) {
    // Show delete and merge buttons only when editing existing entry
    deleteEntryBtn.classList.remove('hidden')
    mergeEntryBtn.classList.remove('hidden')
    
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
    checkDuplicate(entry.name, entry.city)
  } else {
    // Adding new entry
    editorTitle.textContent = 'Add Memorial Entry'
    deleteEntryBtn.classList.add('hidden')
    mergeEntryBtn.classList.add('hidden')
  }
  
  editorStatus.classList.add('hidden')
  showSection('editor')
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function checkDuplicate(name: string, city?: string, name_fa?: string) {
  const normalizedName = name?.toLowerCase().trim() || ''
  const currentNameFa = name_fa?.trim() || (document.getElementById('name_fa') as HTMLInputElement)?.value.trim()
  const currentCity = city?.toLowerCase().trim() || (document.getElementById('city') as HTMLInputElement)?.value.toLowerCase().trim()

  if (normalizedName.length < 3 && currentNameFa.length < 3) {
    duplicateWarning.classList.add('hidden')
    return
  }
  
  const nameParts = normalizedName.split(/\s+/).filter(p => p.length > 2)
  const nameFaParts = currentNameFa.split(/\s+/).filter(p => p.length > 1)
  
  // Common prefixes to ignore in partial matches
  const commonPrefixes = ['syed', 'seyyed', 'sayyid', 'mir', 'haji', 'haj', 'mullah', 'sheikh']
  const filteredParts = nameParts.filter(p => !commonPrefixes.includes(p))

  const match = allMemorials.find(m => {
    if (m.id === editIdInput.value) return false
    
    const mName = m.name.toLowerCase().trim()
    const mNameFa = (m.name_fa || '').trim()
    const mCity = m.city.toLowerCase().trim()
    const mLocation = (m.location || '').toLowerCase().trim()

    // 1. Exact match (High Confidence) - English or Persian
    if (normalizedName && mName === normalizedName) return true
    if (currentNameFa && mNameFa === currentNameFa) return true

    // 2. Persian Partial Match (High Confidence)
    // Persian spellings are more consistent than English transliterations
    if (nameFaParts.length >= 2) {
      const faMatch = nameFaParts.every(part => mNameFa.includes(part))
      if (faMatch) return true
    }

    // 3. Significant English Name Parts + Location (Medium Confidence)
    if (filteredParts.length >= 2 && currentCity) {
      const nameMatch = filteredParts.every(part => mName.includes(part))
      const cityMatch = mCity.includes(currentCity) || currentCity.includes(mCity) || mLocation.includes(currentCity)
      if (nameMatch && cityMatch) return true
    }

    // 4. Full include match (Medium Confidence)
    if (normalizedName.length > 10 && mName.includes(normalizedName)) return true
    if (currentNameFa.length > 5 && mNameFa.includes(currentNameFa)) return true

    return false
  })

  if (match) {
    duplicateWarning.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        <div>⚠️ <strong>Duplicate Found:</strong> ${match.name} (${match.city})</div>
        <div style="font-size: 0.8rem; opacity: 0.9;">
          If you save, this new entry will be <strong>merged</strong> into the existing one as a new reference.
        </div>
        <button type="button" class="btn btn-secondary btn-sm edit-match-btn" style="align-self: flex-start;">
          Edit Existing Instead
        </button>
      </div>
    `
    duplicateWarning.classList.remove('hidden')
    
    duplicateWarning.querySelector('.edit-match-btn')?.addEventListener('click', () => {
      editEntry(match.id!)
    })
  } else {
    duplicateWarning.classList.add('hidden')
  }
}

document.getElementById('name')?.addEventListener('input', (e) => {
  checkDuplicate((e.target as HTMLInputElement).value)
})

document.getElementById('name_fa')?.addEventListener('input', (e) => {
  const name = (document.getElementById('name') as HTMLInputElement).value
  checkDuplicate(name, undefined, (e.target as HTMLInputElement).value)
})

document.getElementById('city')?.addEventListener('input', (e) => {
  const name = (document.getElementById('name') as HTMLInputElement).value
  const name_fa = (document.getElementById('name_fa') as HTMLInputElement).value
  checkDuplicate(name, (e.target as HTMLInputElement).value, name_fa)
})

searchSubmissions.addEventListener('input', renderSubmissions)
searchMemorials.addEventListener('input', renderVerified)
sortSubmissions.addEventListener('change', renderSubmissions)
sortMemorials.addEventListener('change', renderVerified)
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
    const victims = await extractMemorialData(url)
    if (!victims || victims.length === 0) {
      throw new Error('No memorial data found at this URL.')
    }
    
    // For the quick import form, we take the first victim
    const data = victims[0]
    populateForm(data)
    
    // Add reference automatically
    const refsArea = document.getElementById('references') as HTMLTextAreaElement
    const existingRefs = refsArea.value.trim()
    const isXUrl = url.includes('x.com') || url.includes('twitter.com')
    const newRef = `${data.referenceLabel || (isXUrl ? 'X Post' : 'Source')} | ${url}`
    refsArea.value = existingRefs ? `${existingRefs}\n${newRef}` : newRef
    
    if (isXUrl) {
      (document.getElementById('xPost') as HTMLInputElement).value = url
    } else {
      (document.getElementById('xPost') as HTMLInputElement).value = ''
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
  const originalText = extractImgBtn.textContent
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
    extractImgBtn.textContent = originalText
  }
})

syncCoordsBtn.addEventListener('click', async () => {
  const city = (document.getElementById('city') as HTMLInputElement).value.trim()
  const location = (document.getElementById('location') as HTMLInputElement).value.trim()
  if (!city) {
    alert('City is required to sync coordinates.')
    return
  }

  syncCoordsBtn.disabled = true
  const originalText = syncCoordsBtn.textContent
  syncCoordsBtn.textContent = '...'

  try {
    const coords = await geocodeLocation(city, location)
    if (coords) {
      (document.getElementById('lat') as HTMLInputElement).value = `${coords.lat}`;
      (document.getElementById('lon') as HTMLInputElement).value = `${coords.lon}`;
      alert('Coordinates synced!');
    } else {
      alert('Could not find coordinates for this location.')
    }
  } catch (e) {
    alert('Failed to sync coordinates.')
  } finally {
    syncCoordsBtn.disabled = false
    syncCoordsBtn.textContent = originalText
  }
})

batchImgBtn.addEventListener('click', async () => {
  if (!confirm('Sync images for all memorials? This might take a while.')) return
  batchImgBtn.disabled = true
  const originalText = batchImgBtn.textContent
  batchImgBtn.textContent = '⌛ Processing...'
  try {
    const { success, count, error } = await batchUpdateImages()
    if (success) {
      alert(`Successfully updated ${count} memorials!`)
      loadData()
    } else alert(`Failed: ${error}`)
  } catch (e) { alert('Failed.') } finally { 
    batchImgBtn.disabled = false 
    batchImgBtn.textContent = originalText
  }
})

batchTranslateBtn.addEventListener('click', async () => {
  if (!confirm('Use AI to fix missing translations?')) return
  batchTranslateBtn.disabled = true
  const originalText = batchTranslateBtn.textContent
  batchTranslateBtn.textContent = '⌛ Processing...'
  try {
    const { success, count, error } = await batchTranslateMemorials()
    if (success) {
      alert(`Successfully translated ${count} memorials!`)
      loadData()
    } else alert(`Failed: ${error}`)
  } catch (e) { alert('Failed.') } finally { 
    batchTranslateBtn.disabled = false 
    batchTranslateBtn.textContent = originalText
  }
})

batchCoordsBtn.addEventListener('click', async () => {
  if (!confirm('Use AI to sync all coordinates?')) return
  batchCoordsBtn.disabled = true
  const originalText = batchCoordsBtn.textContent
  batchCoordsBtn.textContent = '⌛ Processing...'
  try {
    const { success, count, error } = await batchSyncLocationCoords()
    if (success) {
      alert(`Successfully synced ${count} memorials!`)
      loadData()
    } else alert(`Failed: ${error}`)
  } catch (e) { alert('Failed.') } finally { 
    batchCoordsBtn.disabled = false 
    batchCoordsBtn.textContent = originalText
  }
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
    const { success, merged, error } = await submitMemorial(data)
    if (success) {
      jsonImportArea.value = ''
      alert(merged ? 'Merged into existing entry successfully!' : 'Memorial saved successfully!')
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

  if (data.name || data.name_fa) {
    checkDuplicate(data.name || '', data.city, data.name_fa || undefined)
  }
}

async function handleVerify(id: string) {
  if (!confirm('Verify this entry?')) return
  const { success, merged, error } = await verifyMemorial(id)
  if (success) {
    alert(merged ? 'Merged into existing verified entry!' : 'Verified!')
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
  const { success, merged, error } = await submitMemorial(entry)
  if (success) {
    alert(merged ? 'Merged into existing entry successfully!' : 'Saved successfully!')
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
  duplicateWarning.classList.add('hidden')
  editorStatus.classList.add('hidden')
  deleteEntryBtn.classList.add('hidden')
  mergeEntryBtn.classList.add('hidden')
  translateEntryBtn.classList.add('hidden')
  ;(document.getElementById('lat') as HTMLInputElement).value = '35.6892'
  ;(document.getElementById('lon') as HTMLInputElement).value = '51.3890'
}

deleteEntryBtn.addEventListener('click', () => {
  if (editIdInput.value) {
    handleDelete(editIdInput.value)
    clearForm()
    showSection('overview')
  }
})

mergeEntryBtn.addEventListener('click', () => {
  if (editIdInput.value) {
    openMergeModal(editIdInput.value)
  }
})

translateEntryBtn.addEventListener('click', async () => {
  const name = (document.getElementById('name') as HTMLInputElement).value
  const city = (document.getElementById('city') as HTMLInputElement).value
  const location = (document.getElementById('location') as HTMLInputElement).value
  const bio = (document.getElementById('bio') as HTMLTextAreaElement).value

  if (!name && !city && !location && !bio) {
    alert('Please fill some fields to translate.')
    return
  }

  translateEntryBtn.disabled = true
  const originalText = translateEntryBtn.textContent
  translateEntryBtn.textContent = '...'
  
  editorStatus.textContent = '🌍 Translating with AI...'
  editorStatus.className = 'loading'
  editorStatus.classList.remove('hidden')

  try {
    const { translateMemorialData } = await import('./modules/ai')
    const result = await translateMemorialData({ name, city, location, bio })

    if (result) {
      const t = result
      if (t.name_fa) (document.getElementById('name_fa') as HTMLInputElement).value = t.name_fa
      if (t.city_fa) (document.getElementById('city_fa') as HTMLInputElement).value = t.city_fa
      if (t.location_fa) (document.getElementById('location_fa') as HTMLInputElement).value = t.location_fa
      if (t.bio_fa) (document.getElementById('bio_fa') as HTMLTextAreaElement).value = t.bio_fa
      
      editorStatus.textContent = '✅ Translation complete!'
      editorStatus.className = 'success'
      setTimeout(() => editorStatus.classList.add('hidden'), 3000)
    } else {
      throw new Error('AI returned an empty response.')
    }
  } catch (e) {
    editorStatus.textContent = '❌ Translation failed: ' + (e instanceof Error ? e.message : 'Unknown error')
    editorStatus.className = 'error'
  } finally {
    translateEntryBtn.disabled = false
    translateEntryBtn.textContent = originalText
  }
})

clearBtn.addEventListener('click', clearForm)

// Initialize
checkUser()
