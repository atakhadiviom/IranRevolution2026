import { supabase } from './modules/supabase'
import { fetchMemorials, verifyMemorial, deleteMemorial, submitMemorial } from './modules/dataService'
import { extractMemorialData } from './modules/ai'
import { extractXPostImage } from './modules/imageExtractor'
import type { MemorialEntry } from './modules/types'

// DOM Elements
const loginSection = document.getElementById('login-section') as HTMLDivElement
const adminSection = document.getElementById('admin-section') as HTMLDivElement
const loginForm = document.getElementById('login-form') as HTMLFormElement
const loginError = document.getElementById('login-error') as HTMLParagraphElement
const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement
const userEmailSpan = document.getElementById('user-email') as HTMLSpanElement
const submissionsList = document.getElementById('submissions-list') as HTMLDivElement
const verifiedList = document.getElementById('verified-list') as HTMLDivElement
const countUnverified = document.getElementById('count-unverified') as HTMLSpanElement
const countVerified = document.getElementById('count-verified') as HTMLSpanElement
const tabUnverified = document.getElementById('tab-unverified') as HTMLDivElement
const tabVerified = document.getElementById('tab-verified') as HTMLDivElement
const unverifiedSection = document.getElementById('unverified-section') as HTMLDivElement
const verifiedSection = document.getElementById('verified-section') as HTMLDivElement
const entryForm = document.getElementById('entry-form') as HTMLFormElement
const editIdInput = document.getElementById('edit-id') as HTMLInputElement
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement
const output = document.getElementById('output') as HTMLPreElement

// Quick Import Elements
const aiUrlInput = document.getElementById('ai-url') as HTMLInputElement
const aiExtractBtn = document.getElementById('ai-extract-btn') as HTMLButtonElement
const extractImgBtn = document.getElementById('extract-img-btn') as HTMLButtonElement
const aiStatus = document.getElementById('ai-status') as HTMLParagraphElement
const jsonImportArea = document.getElementById('json-import') as HTMLTextAreaElement
const jsonImportBtn = document.getElementById('json-import-btn') as HTMLButtonElement

let currentSubmissions: MemorialEntry[] = []

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
  loadSubmissions()
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

// --- Tab Logic ---

tabUnverified.addEventListener('click', () => {
  tabUnverified.classList.add('active')
  tabVerified.classList.remove('active')
  unverifiedSection.classList.remove('hidden')
  verifiedSection.classList.add('hidden')
})

tabVerified.addEventListener('click', () => {
  tabVerified.classList.add('active')
  tabUnverified.classList.remove('active')
  verifiedSection.classList.remove('hidden')
  unverifiedSection.classList.add('hidden')
})

// --- Dashboard Logic ---

async function loadSubmissions() {
  submissionsList.innerHTML = '<p style="text-align: center; color: var(--muted); padding: 2rem;">Loading submissions...</p>'
  verifiedList.innerHTML = '<p style="text-align: center; color: var(--muted); padding: 2rem;">Loading verified memorials...</p>'
  
  const allMemorials = await fetchMemorials(true)
  
  const unverified = allMemorials.filter(s => !s.verified)
  const verified = allMemorials.filter(s => s.verified)

  countUnverified.textContent = unverified.length.toString()
  countVerified.textContent = verified.length.toString()
  
  renderList(unverified, submissionsList)
  renderList(verified, verifiedList)
  
  currentSubmissions = allMemorials
}

function renderList(submissions: MemorialEntry[], container: HTMLDivElement) {
  if (submissions.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--muted); padding: 2rem;">No entries found.</p>'
    return
  }

  container.innerHTML = submissions.map(s => `
    <div class="submission-item">
      <div class="submission-info">
        <h4>${s.name} ${s.name_fa ? `(${s.name_fa})` : ''}</h4>
        <p>${s.city} - ${s.date}</p>
        <span class="status-badge ${s.verified ? 'status-verified' : 'status-pending'}">
          ${s.verified ? 'Verified' : 'Pending'}
        </span>
      </div>
      <div class="actions">
        <button class="edit-btn" data-id="${s.id}">Edit</button>
        ${!s.verified ? `<button class="primary verify-btn" data-id="${s.id}">Verify</button>` : ''}
        <button class="danger delete-btn" data-id="${s.id}">Delete</button>
      </div>
    </div>
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
  const entry = currentSubmissions.find(s => s.id === id)
  if (!entry) return

  editIdInput.value = entry.id || '';
  (document.getElementById('name') as HTMLInputElement).value = entry.name;
  (document.getElementById('name_fa') as HTMLInputElement).value = entry.name_fa || '';
  (document.getElementById('city') as HTMLInputElement).value = entry.city;
  (document.getElementById('city_fa') as HTMLInputElement).value = entry.city_fa || '';
  (document.getElementById('location') as HTMLInputElement).value = entry.location || '';
  (document.getElementById('location_fa') as HTMLInputElement).value = entry.location_fa || '';
  (document.getElementById('date') as HTMLInputElement).value = entry.date;
  (document.getElementById('lat') as HTMLInputElement).value = (entry.coords?.lat || 35.6892).toString();
  (document.getElementById('lon') as HTMLInputElement).value = (entry.coords?.lon || 51.3890).toString();
  (document.getElementById('bio') as HTMLTextAreaElement).value = entry.bio || '';
  (document.getElementById('bio_fa') as HTMLTextAreaElement).value = entry.bio_fa || '';
  (document.getElementById('testimonials') as HTMLTextAreaElement).value = entry.testimonials?.join('\n') || '';
  (document.getElementById('photo') as HTMLInputElement).value = entry.media?.photo || '';
  (document.getElementById('xPost') as HTMLInputElement).value = entry.media?.xPost || '';
  (document.getElementById('references') as HTMLTextAreaElement).value = 
    entry.references?.map(r => `${r.label} | ${r.url}`).join('\n') || '';
  (document.getElementById('verified') as HTMLInputElement).checked = entry.verified || false;
  
  output.textContent = JSON.stringify(entry, null, 2);
  entryForm.scrollIntoView({ behavior: 'smooth' });
}

// --- Quick Import Logic ---

aiExtractBtn.addEventListener('click', async () => {
  const url = aiUrlInput.value.trim()
  if (!url) return

  aiExtractBtn.disabled = true
  aiExtractBtn.textContent = 'Extracting...'
  aiStatus.textContent = 'Fetching source content...'
  aiStatus.className = ''
  aiStatus.classList.remove('hidden')

  try {
    const data = await extractMemorialData(url)
    populateForm(data)
    
    // Also set references automatically
    const refsArea = document.getElementById('references') as HTMLTextAreaElement
    const existingRefs = refsArea.value.trim()
    const newRef = `${data.referenceLabel || 'Source'} | ${url}`
    refsArea.value = existingRefs ? `${existingRefs}\n${newRef}` : newRef
    
    // Set X Post if it looks like one
    if (url.includes('x.com') || url.includes('twitter.com')) {
      (document.getElementById('xPost') as HTMLInputElement).value = url
    }

    aiStatus.textContent = '✨ Extraction successful!'
    aiStatus.style.color = 'var(--success)'
  } catch (error) {
    aiStatus.textContent = error instanceof Error ? error.message : 'Extraction failed'
    aiStatus.style.color = 'var(--danger)'
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
  extractImgBtn.textContent = 'Extracting...'
  
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
    extractImgBtn.textContent = 'Extract Image'
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

    // Force verified to true for admin imports
    data.verified = true
    
    // Attempt to save immediately
    jsonImportBtn.disabled = true
    jsonImportBtn.textContent = 'Saving...'
    
    const { success, error } = await submitMemorial(data)
    
    if (success) {
      jsonImportArea.value = ''
      alert('JSON imported and saved successfully as a verified memorial!')
      loadSubmissions()
    } else {
      alert(`Error: ${error}`)
    }
  } catch (e) {
    alert('Invalid JSON format. Please check your input.')
  } finally {
    jsonImportBtn.disabled = false
    jsonImportBtn.textContent = 'Import & Save Memorial'
  }
})

function populateForm(data: Partial<MemorialEntry> & { referenceLabel?: string }) {
  if (data.name) {
    (document.getElementById('name') as HTMLInputElement).value = data.name
  }
  if (data.name_fa) {
    (document.getElementById('name_fa') as HTMLInputElement).value = data.name_fa
  }
  if (data.city) {
    (document.getElementById('city') as HTMLInputElement).value = data.city
  }
  if (data.city_fa) {
    (document.getElementById('city_fa') as HTMLInputElement).value = data.city_fa
  }
  if (data.location) {
    (document.getElementById('location') as HTMLInputElement).value = data.location
  }
  if (data.location_fa) {
    (document.getElementById('location_fa') as HTMLInputElement).value = data.location_fa
  }
  if (data.date) {
    (document.getElementById('date') as HTMLInputElement).value = data.date
  }
  
  if (data.coords) {
    const lat = data.coords.lat || 35.6892
    const lon = data.coords.lon || 51.3890
    ;(document.getElementById('lat') as HTMLInputElement).value = lat.toString()
    ;(document.getElementById('lon') as HTMLInputElement).value = lon.toString()
  }
  
  if (data.bio) {
    (document.getElementById('bio') as HTMLTextAreaElement).value = data.bio
  }
  if (data.bio_fa) {
    (document.getElementById('bio_fa') as HTMLTextAreaElement).value = data.bio_fa
  }
  
  if (Array.isArray(data.testimonials)) {
    (document.getElementById('testimonials') as HTMLTextAreaElement).value = data.testimonials.join('\n')
  }
  
  if (data.media) {
    if (data.media.photo) {
      (document.getElementById('photo') as HTMLInputElement).value = data.media.photo
    }
    if (data.media.xPost) {
      (document.getElementById('xPost') as HTMLInputElement).value = data.media.xPost
    }
  } else {
    const photo = (data as { photo?: string }).photo
    if (photo) {
      (document.getElementById('photo') as HTMLInputElement).value = photo
    }
  }
  
  if (Array.isArray(data.references)) {
    (document.getElementById('references') as HTMLTextAreaElement).value = 
      data.references.map((r) => `${r.label} | ${r.url}`).join('\n')
  }
}

async function handleVerify(id: string) {
  if (!confirm('Are you sure you want to verify this entry? It will appear on the live map.')) return
  const { success, error } = await verifyMemorial(id)
  if (success) {
    alert('Entry verified successfully!')
    loadSubmissions()
  } else {
    alert(`Error: ${error}`)
  }
}

async function handleDelete(id: string) {
  if (!confirm('Are you sure you want to delete this entry? This action cannot be undone.')) return
  const { success, error } = await deleteMemorial(id)
  if (success) {
    alert('Entry deleted successfully!')
    loadSubmissions()
  } else {
    alert(`Error: ${error}`)
  }
}

entryForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  
  const name = (document.getElementById('name') as HTMLInputElement).value.trim()
  const xPost = (document.getElementById('xPost') as HTMLInputElement).value.trim()
  const rawReferences = (document.getElementById('references') as HTMLTextAreaElement).value.trim()
  
  const references = rawReferences
    .split('\n')
    .map(line => {
      const [label, url] = line.split('|').map(s => s.trim())
      if (label && url) return { label, url }
      return null
    })
    .filter(Boolean) as { label: string, url: string }[]

  if (!name) {
    alert('Name is required.')
    return
  }

  if (!xPost && references.length === 0) {
    alert('At least one link (X Post URL or a Reference) is required.')
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
    alert('Memorial saved successfully!')
    clearForm()
    loadSubmissions()
  } else {
    alert(`Error saving: ${error}`)
  }
})

function clearForm() {
  entryForm.reset()
  editIdInput.value = ''
  output.textContent = ''
}

clearBtn.addEventListener('click', clearForm)

// Initialize
checkUser()
