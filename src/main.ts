import './style.css'
import { loadTranslations, t, setLanguage, currentLanguage } from './modules/i18n'
import { initMap, plotMarkers, onMarkerSelected, onShowListView, focusOnMarker } from './modules/map'
import type { MemorialEntry } from './modules/types'
import { setupSearch } from './modules/search'
import { extractMemorialData } from './modules/ai'
import { fetchMemorials, submitMemorial } from './modules/dataService'
import { initTwitter } from './modules/twitter'
import { supabase } from './modules/supabase'

let currentMemorials: MemorialEntry[] = []

async function boot() {
  initTwitter()
  await loadTranslations(currentLanguage())
  
  const memorials = await fetchMemorials()
  
  currentMemorials = memorials

  initUiText()
  updateTotalCounter(memorials.length)
  initLanguageSwitcher()
  initMap()
  initListView()
  plotMarkers(memorials)
  initContributionForm()
  initMobileMenu()
  setupSearch(memorials, (filtered) => {
    plotMarkers(filtered)
    const aside = document.getElementById('details-panel') as HTMLElement
    aside.classList.remove('active')
    clearDetails(filtered)
  })
  onMarkerSelected((entry) => renderDetails(entry))

  setupRealtime()
}

function setupRealtime() {
  if (!supabase) return

  supabase
    .channel('memorials-realtime')
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'memorials' 
    }, async () => {
       
       // Re-fetch all memorials to ensure consistent state (including order and verification)
      const updatedMemorials = await fetchMemorials()
      currentMemorials = updatedMemorials
      updateTotalCounter(currentMemorials.length)
      
      // Update the map and search
      plotMarkers(currentMemorials)
      setupSearch(currentMemorials, (filtered) => {
        plotMarkers(filtered)
        const aside = document.getElementById('details-panel') as HTMLElement
        aside.classList.remove('active')
        clearDetails(filtered)
      })
    })
    .subscribe()
}

function initMobileMenu() {
  const menuToggle = document.getElementById('menu-toggle')
  const navControls = document.getElementById('nav-controls')

  if (!menuToggle || !navControls) return

  menuToggle.addEventListener('click', () => {
    const isOpen = menuToggle.classList.contains('open')
    menuToggle.classList.toggle('open')
    navControls.classList.toggle('open')
    menuToggle.setAttribute('aria-expanded', String(!isOpen))
  })

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (!menuToggle.contains(target) && !navControls.contains(target)) {
      menuToggle.classList.remove('open')
      navControls.classList.remove('open')
      menuToggle.setAttribute('aria-expanded', 'false')
    }
  })

  // Close menu when a link or button inside is clicked
  navControls.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'BUTTON' || target.tagName === 'A' || target.tagName === 'SELECT') {
      if (target.tagName !== 'SELECT') {
        menuToggle.classList.remove('open')
        navControls.classList.remove('open')
        menuToggle.setAttribute('aria-expanded', 'false')
      }
    }
  })
}

function initListView() {
  const listViewBtn = document.getElementById('list-view-btn')
  const modalOverlay = document.getElementById('modal-overlay')!
  const modalBody = document.getElementById('modal-body')!
  const modalContent = modalOverlay.querySelector('.modal-content')!

  listViewBtn?.addEventListener('click', () => {
    document.body.style.overflow = 'hidden'
    renderListView(currentMemorials)
  })

  onShowListView((entries) => {
    document.body.style.overflow = 'hidden'
    renderListView(entries)
  })

  function renderListView(entries: MemorialEntry[]) {
    const isFa = currentLanguage() === 'fa'
    modalContent.classList.add('large')
    modalOverlay.classList.remove('hidden')
    
    const renderItems = (items: MemorialEntry[]) => {
      if (items.length === 0) {
        return `<div class="list-empty-state">${t('list.noResults')}</div>`
      }
      return items.map(entry => {
        const displayName = (isFa && entry.name_fa) ? entry.name_fa : entry.name
        const displayCity = (isFa && entry.city_fa) ? entry.city_fa : entry.city
        const photo = entry.media?.photo || 'https://via.placeholder.com/300?text=No+Photo'
        
        return `
          <div class="list-item-card" data-id="${entry.id}">
            <img src="${photo}" alt="${displayName}" class="list-item-photo" loading="lazy">
            <div class="list-item-info">
              <div class="list-item-name">${displayName}</div>
              <div class="list-item-meta">${displayCity}</div>
            </div>
          </div>
        `
      }).join('')
    }

    modalBody.innerHTML = `
      <div class="list-view-container">
        <div class="list-view-header">
          <h2>${t('list.title')} (${entries.length} ${t('list.people')})</h2>
        </div>
        <div class="list-view-controls">
          <input type="search" id="list-search" class="list-view-search" placeholder="${t('list.search')}" autofocus>
        </div>
        <div id="list-grid" class="list-view-grid">
          ${renderItems(entries)}
        </div>
      </div>
    `

    const searchInput = document.getElementById('list-search') as HTMLInputElement
    const grid = document.getElementById('list-grid')!

    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase().trim()
      const filtered = entries.filter(e => {
        const name = (e.name || '').toLowerCase()
        const nameFa = (e.name_fa || '').toLowerCase()
        const city = (e.city || '').toLowerCase()
        const cityFa = (e.city_fa || '').toLowerCase()
        return name.includes(query) || nameFa.includes(query) || city.includes(query) || cityFa.includes(query)
      })
      grid.innerHTML = renderItems(filtered)
    })

    grid.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest('.list-item-card') as HTMLElement
      if (card) {
        const id = card.dataset.id
        const entry = entries.find(item => item.id === id)
        if (entry) {
          modalOverlay.classList.add('hidden')
          modalContent.classList.remove('large')
          document.body.style.overflow = ''
          focusOnMarker(entry)
          renderDetails(entry)
        }
      }
    })
  }

  // Handle modal close to remove 'large' class
  document.getElementById('close-modal')?.addEventListener('click', () => {
    modalContent.classList.remove('large')
  })
  
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      modalContent.classList.remove('large')
    }
  })
}

function initUiText() {
  const title = document.getElementById('site-title')
  const searchInput = document.getElementById('search-input') as HTMLInputElement
  const footerNote = document.getElementById('footer-note')
  const privacyLink = document.getElementById('privacy-link') as HTMLAnchorElement
  const badge = document.getElementById('total-count-badge')
  const listViewBtn = document.getElementById('list-view-btn')

  if (title) title.textContent = t('site.title')
  if (searchInput) searchInput.placeholder = t('search.placeholder')
  if (footerNote) footerNote.textContent = t('site.footerNote')
  if (privacyLink) privacyLink.textContent = t('site.privacy')
  if (listViewBtn) listViewBtn.textContent = t('list.viewAll')
  if (badge) {
    badge.title = t('stats.livesHonored')
    badge.setAttribute('aria-label', `${t('stats.livesHonored')}: ${badge.textContent}`)
  }
}

function updateTotalCounter(count: number) {
  const badge = document.getElementById('total-count-badge')
  if (badge) {
    badge.textContent = count.toString()
    badge.title = t('stats.livesHonored')
    badge.setAttribute('aria-label', `${t('stats.livesHonored')}: ${count}`)
  }
}

function initLanguageSwitcher() {
  const select = document.getElementById('language-select') as HTMLSelectElement
  select.addEventListener('change', async () => {
    await setLanguage(select.value as 'en' | 'fa')
    initUiText()
    plotMarkers(currentMemorials)
    clearDetails(currentMemorials)
    document.documentElement.dir = select.value === 'fa' ? 'rtl' : 'ltr'
    document.documentElement.lang = select.value
  })
}

function renderDetails(entry: MemorialEntry) {
  const panel = document.getElementById('details-content')!
  const isFa = currentLanguage() === 'fa'
  
  const date = new Date(entry.date).toLocaleDateString(isFa ? 'fa-IR' : 'en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })

  const displayName = (isFa && entry.name_fa) ? entry.name_fa : entry.name
  const displayCity = (isFa && entry.city_fa) ? entry.city_fa : entry.city
  const displayLocation = (isFa && entry.location_fa) ? entry.location_fa : entry.location
  const displayBio = (isFa && entry.bio_fa) ? entry.bio_fa : entry.bio
  const displayTestimonials = (isFa && entry.testimonials_fa) ? entry.testimonials_fa : entry.testimonials
  
  panel.innerHTML = `
    <button id="close-details" class="close-button" aria-label="${t('details.close')}">&times;</button>
    <article class="memorial-profile">
      <header class="profile-header">
        <h2>${displayName}</h2>
        <p class="profile-meta">
          <strong>${t('details.city')}:</strong> ${displayCity}<br>
          <strong>${t('details.date')}:</strong> ${date}<br>
          <strong>${t('details.location')}:</strong> ${displayLocation}
        </p>
      </header>

      ${entry.media?.photo ? `
        <figure class="profile-photo">
          <img src="${entry.media.photo}" alt="${t('details.photoAlt', { name: displayName })}" loading="lazy" />
          <figcaption class="photo-attribution">${t('details.photoAttribution')}</figcaption>
        </figure>
      ` : ''}

      <div class="profile-bio">
        ${displayBio ? `<p>${displayBio}</p>` : ''}
      </div>

      <div class="candle-section">
        <button id="light-candle" class="candle-button">🕯️ ${t('details.lightCandle')}</button>
        <span id="candle-count" class="candle-count">0 ${t('details.candlesLit')}</span>
      </div>

      <div class="report-section">
        <a href="https://github.com/atakhadiviom/IranRevolution2026/issues/new?title=Report+Issue:+${encodeURIComponent(entry.name)}&body=${encodeURIComponent(`I am reporting an issue with the entry for ${entry.name}${entry.id ? ` (ID: ${entry.id})` : ''}.\n\nReason:\n[Please describe the problem here, e.g., wrongly added, incorrect date, etc.]`)}" 
           target="_blank" class="report-link">
           🚩 ${t('details.reportIssue')}
        </a>
      </div>

      ${entry.media?.video ? `
        <div class="profile-video">
          <h3>${t('details.video')}</h3>
          <video controls src="${entry.media.video}" aria-label="${t('details.videoAlt', { name: entry.name })}"></video>
        </div>
      ` : ''}

      ${entry.media?.xPost ? `
        <div class="profile-x-post">
          <h3>${t('details.xPost')}</h3>
          <blockquote class="twitter-tweet" data-theme="dark" data-dnt="true">
            <a href="${entry.media.xPost}"></a>
          </blockquote>
        </div>
      ` : ''}

      ${entry.references?.length ? `
        <section class="profile-references">
          <h3>${t('details.references')}</h3>
          <ul>
            ${entry.references.map(ref => `
              <li><a href="${ref.url}" target="_blank" rel="noopener noreferrer">${ref.label}</a></li>
            `).join('')}
          </ul>
        </section>
      ` : ''}

      ${displayTestimonials?.length ? `
        <section class="profile-testimonials">
          <h3>${t('details.testimonials')}</h3>
          ${displayTestimonials.map((s) => `<blockquote>${s}</blockquote>`).join('')}
        </section>
      ` : ''}
    </article>
  `
  
  const aside = document.getElementById('details-panel') as HTMLElement
  aside.classList.add('active')
  aside.focus()

  // Trigger Twitter widget rendering if present
  if (entry.media?.xPost) {
    const twttr = window.twttr
    if (twttr && twttr.ready) {
      twttr.ready((t) => {
        t.widgets.load(panel)
      })
    }
  }

  document.getElementById('close-details')?.addEventListener('click', () => {
    aside.classList.remove('active')
    clearDetails(currentMemorials)
  })
  
  const candleBtn = document.getElementById('light-candle')
  const candleCount = document.getElementById('candle-count')
  const entryId = entry.id || entry.name.toLowerCase().replace(/\s+/g, '-')
  
  // Get existing count or generate a starting random number between 100 and 1000
  let countStr = localStorage.getItem(`candle-${entryId}`)
  if (!countStr) {
    const startCount = Math.floor(Math.random() * (1000 - 100 + 1)) + 100
    localStorage.setItem(`candle-${entryId}`, String(startCount))
    countStr = String(startCount)
  }
  let count = Number(countStr)
  
  if (candleCount) candleCount.textContent = `${count} ${t('details.candlesLit')}`
  
  candleBtn?.addEventListener('click', () => {
    count++
    localStorage.setItem(`candle-${entryId}`, String(count))
    if (candleCount) candleCount.textContent = `${count} ${t('details.candlesLit')}`
    candleBtn.classList.add('lit')
  }, { once: true })
}

function clearDetails(memorials: MemorialEntry[]) {
  const panel = document.getElementById('details-content')!
  const total = memorials.length
  const cities = new Set(memorials.map(m => m.city)).size
  
  panel.innerHTML = `
    <div class="stats-overview">
      <h3>${t('site.title')}</h3>
      <p class="muted">${t('details.empty')}</p>
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-value">${total}</span>
          <span class="stat-label">${t('stats.livesHonored')}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${cities}</span>
          <span class="stat-label">${t('stats.cities')}</span>
        </div>
      </div>
    </div>
  `
}

function initContributionForm() {
  const btn = document.getElementById('contribute-btn')
  const fab = document.getElementById('fab-contribute')
  const overlay = document.getElementById('modal-overlay')
  const close = document.getElementById('close-modal')
  const body = document.getElementById('modal-body')
  const modalContent = overlay?.querySelector('.modal-content')

  if (!btn || !overlay || !close || !body || !modalContent) return

  const openModal = () => {
    overlay.classList.remove('hidden')
    document.body.style.overflow = 'hidden'
    document.body.classList.add('modal-open')
    renderForm()
  }

  btn.addEventListener('click', openModal)
  fab?.addEventListener('click', openModal)

  close.addEventListener('click', () => {
    overlay.classList.add('hidden')
    modalContent.classList.remove('large')
    document.body.style.overflow = ''
    document.body.classList.remove('modal-open')
  })

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.add('hidden')
      modalContent.classList.remove('large')
      document.body.style.overflow = ''
      document.body.classList.remove('modal-open')
    }
  })

  function renderForm() {
    body!.innerHTML = `
      <div class="contribution-form">
        <h2>${t('contribute.title')}</h2>
        <p>${t('contribute.desc')}</p>

        <div class="ai-assistant">
          <div class="form-group">
            <label>${t('ai.extractLabel')}</label>
            <div class="ai-input-group">
              <input type="url" id="ai-url" placeholder="Paste X/Twitter link or News URL">
              <button type="button" id="ai-extract-btn" class="ai-button">
                ✨ ${t('ai.button')}
              </button>
            </div>
            <p class="ai-hint">${t('ai.hint')}</p>
          </div>
          <div id="ai-status" class="ai-status hidden"></div>
        </div>
        
        <hr class="form-divider">

        <form id="victim-form">
          <div class="form-row">
            <div class="form-group">
              <label>${t('contribute.name')}</label>
              <input type="text" name="name" required placeholder="Full Name">
              <div id="duplicate-warning" class="duplicate-warning hidden"></div>
            </div>
            <div class="form-group">
              <label>${t('contribute.city')}</label>
              <input type="text" name="city" placeholder="City">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>${t('contribute.date')}</label>
              <input type="date" name="date">
            </div>
            <div class="form-group">
              <label>${t('contribute.location')}</label>
              <input type="text" name="location" placeholder="Specific location (optional)">
            </div>
          </div>

          <div class="form-group">
            <label>${t('contribute.bio')}</label>
            <textarea name="bio" placeholder="Brief biography or story..."></textarea>
          </div>

          <div class="form-group">
            <label>${t('contribute.reference')}</label>
            <input type="url" name="refUrl" required placeholder="Link to X, news, or report for confirmation">
            <input type="text" name="refLabel" placeholder="Reference Label (e.g. X Thread, BBC News)">
          </div>

          <button type="submit" class="submit-button">${t('contribute.submit')}</button>
        </form>
      </div>
    `

    const form = document.getElementById('victim-form') as HTMLFormElement
    const aiBtn = document.getElementById('ai-extract-btn') as HTMLButtonElement
    const aiUrl = document.getElementById('ai-url') as HTMLInputElement
    const aiStatus = document.getElementById('ai-status') as HTMLDivElement

    const nameInput = form.querySelector('[name="name"]') as HTMLInputElement
    const duplicateWarning = document.getElementById('duplicate-warning') as HTMLDivElement

    const checkDuplicate = (name: string, city?: string) => {
      if (!name || name.length < 3) {
        duplicateWarning.classList.add('hidden')
        return
      }

      const normalizedName = name.toLowerCase().trim()
      const currentCity = city?.toLowerCase().trim() || (form.querySelector('[name="city"]') as HTMLInputElement)?.value.toLowerCase().trim()
      
      const nameParts = normalizedName.split(/\s+/).filter(p => p.length > 2)
      const commonPrefixes = ['syed', 'seyyed', 'sayyid', 'mir', 'haji', 'haj', 'mullah', 'sheikh']
      const filteredParts = nameParts.filter(p => !commonPrefixes.includes(p))

      const match = currentMemorials.find(m => {
        const mName = m.name.toLowerCase().trim()
        const mCity = m.city.toLowerCase().trim()
        const mLocation = (m.location || '').toLowerCase().trim()

        // 1. Exact match (High Confidence)
        if (mName === normalizedName) return true

        // 2. Significant Name Parts + Location (Medium Confidence)
        if (filteredParts.length >= 2 && currentCity) {
          const nameMatch = filteredParts.every(part => mName.includes(part))
          const cityMatch = mCity.includes(currentCity) || currentCity.includes(mCity) || mLocation.includes(currentCity)
          if (nameMatch && cityMatch) return true
        }

        // 3. Full include match (Medium Confidence)
        if (normalizedName.length > 10 && mName.includes(normalizedName)) return true

        return false
      })

      if (match) {
        duplicateWarning.innerHTML = `
          <p>⚠️ ${t('contribute.duplicateWarning')}</p>
          <div class="duplicate-actions">
            <button type="button" class="view-duplicate-btn" data-id="${match.id}">
              ${t('details.view')} <strong>${match.name}</strong>
            </button>
            <p style="font-size: 0.85rem; margin-top: 0.5rem; color: var(--muted);">
              ${t('contribute.mergeNote') || 'If you submit, your link will be added as a new reference to this person.'}
            </p>
          </div>
        `
        duplicateWarning.classList.remove('hidden')
        
        duplicateWarning.querySelector('.view-duplicate-btn')?.addEventListener('click', () => {
          const overlay = document.getElementById('modal-overlay')
          overlay?.classList.add('hidden')
          renderDetails(match)
        })
      } else {
        duplicateWarning.classList.add('hidden')
      }
    }

    nameInput?.addEventListener('input', (e) => {
      checkDuplicate((e.target as HTMLInputElement).value)
    })

    form.querySelector('[name="city"]')?.addEventListener('input', (e) => {
      const name = (form.querySelector('[name="name"]') as HTMLInputElement).value
      checkDuplicate(name, (e.target as HTMLInputElement).value)
    })

    aiBtn?.addEventListener('click', async () => {
      const url = aiUrl.value.trim()
      if (!url) return

      // Create and show loading overlay for the form
      const formContainer = form.parentElement!
      const overlay = document.createElement('div')
      overlay.className = 'form-overlay-loading'
      overlay.innerHTML = `
        <div class="spinner" style="width: 40px; height: 40px; border-width: 4px;"></div>
        <span>${t('ai.processing')}...</span>
      `
      formContainer.style.position = 'relative'
      formContainer.appendChild(overlay)

      aiBtn.disabled = true
      aiBtn.innerHTML = `⏳ ${t('ai.processing')}`
      aiStatus.innerHTML = `<div class="spinner"></div> <span>${t('ai.fetching')}</span>`
      aiStatus.className = 'ai-status loading'
      aiStatus.classList.remove('hidden')

      try {
        const data = await extractMemorialData(url)
        
        // Fill form fields
        const nameInput = form.querySelector('[name="name"]') as HTMLInputElement
        const cityInput = form.querySelector('[name="city"]') as HTMLInputElement
        const dateInput = form.querySelector('[name="date"]') as HTMLInputElement
        const locationInput = form.querySelector('[name="location"]') as HTMLInputElement
        const bioInput = form.querySelector('[name="bio"]') as HTMLTextAreaElement
        const refUrlInput = form.querySelector('[name="refUrl"]') as HTMLInputElement
        const refLabelInput = form.querySelector('[name="refLabel"]') as HTMLInputElement

        if (data.name) nameInput.value = data.name
        if (data.city) cityInput.value = data.city
        if (data.date) dateInput.value = data.date
        if (data.location) locationInput.value = data.location
        if (data.bio) bioInput.value = data.bio
        refUrlInput.value = url
        if (data.referenceLabel) refLabelInput.value = data.referenceLabel

        if (data.name) checkDuplicate(data.name)

        aiStatus.textContent = t('ai.success')
        aiStatus.className = 'ai-status success'
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : t('ai.error')
        aiStatus.textContent = errorMessage
        aiStatus.className = 'ai-status error'
      } finally {
        overlay.remove()
        aiBtn.disabled = false
        aiBtn.innerHTML = `✨ ${t('ai.button')}`
      }
    })

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(form)
      const data: Partial<MemorialEntry> = {
        name: fd.get('name') as string,
        city: fd.get('city') as string,
        date: fd.get('date') as string,
        location: fd.get('location') as string,
        bio: fd.get('bio') as string,
        media: {
          xPost: fd.get('refUrl')?.toString().includes('x.com') || fd.get('refUrl')?.toString().includes('twitter.com') 
            ? fd.get('refUrl') as string
            : undefined
        },
        references: [{
          label: (fd.get('refLabel') as string) || 'Reference',
          url: fd.get('refUrl') as string
        }]
      }

      const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement
      submitBtn.disabled = true
      submitBtn.textContent = 'Submitting...'

      const result = await submitMemorial(data)

      if (result.success) {
        body!.innerHTML = `
          <div class="submission-result">
            <div class="success-icon" style="font-size: 3rem; margin: 1.5rem 0;">✅</div>
            <h3>${t('contribute.successTitle')}</h3>
            <p>${t('contribute.pendingReview') || 'Your contribution has been submitted for review. It will appear on the map once verified by an admin.'}</p>
            <div class="actions" style="margin-top: 2rem;">
              <button id="close-modal-success" class="submit-button" style="max-width: 200px; margin: 0 auto;">${t('details.close')}</button>
            </div>
          </div>
        `

        document.getElementById('close-modal-success')?.addEventListener('click', () => {
          overlay?.classList.add('hidden')
          document.body.style.overflow = ''
          document.body.classList.remove('modal-open')
        })
      } else {
        let errorHint = ''
        if (result.error?.toLowerCase().includes('policy')) {
          errorHint = '<br><small style="color:var(--muted)">Hint: This might be a Database Row-Level Security (RLS) issue. Ensure your Supabase table allows public inserts.</small>'
        }
        
        body!.innerHTML = `
          <div class="submission-result error">
            <div class="error-icon" style="font-size: 3rem; margin: 1.5rem 0;">⚠️</div>
            <h3>${t('contribute.errorTitle') || 'Submission Failed'}</h3>
            <p>${result.error || 'An unexpected error occurred. Please try again or submit via GitHub.'}${errorHint}</p>
            
            <div class="offline-submission" style="margin-top: 1.5rem; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 1rem; background: rgba(0,0,0,0.2);">
              <p style="font-size: 0.85rem; margin-bottom: 1rem; color: var(--muted);">You can still submit by copying the data below and opening a GitHub issue:</p>
              <div class="json-preview-container" style="max-height: 200px; overflow-y: auto; text-align: left; background: #111; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
                <code style="font-size: 0.8rem; white-space: pre-wrap;">${JSON.stringify(data, null, 2)}</code>
              </div>
              <div class="actions" style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                <button id="copy-json-btn" class="nav-button btn-sm">${t('contribute.copy')}</button>
                <a href="https://github.com/atakhadiviom/IranRevolution2026/issues/new?title=New+Memorial+Submission&body=${encodeURIComponent('Please add this person to the memorial:\n\n```json\n' + JSON.stringify(data, null, 2) + '\n```')}" 
                   target="_blank" class="nav-button btn-sm" style="display:inline-block;">
                   Open GitHub Issue
                </a>
              </div>
            </div>

            <div class="actions" style="margin-top: 1.5rem;">
              <button id="close-modal-error" class="submit-button secondary" style="max-width: 200px; margin: 0 auto;">${t('details.close')}</button>
            </div>
          </div>
        `
        
        document.getElementById('close-modal-error')?.addEventListener('click', () => {
          overlay?.classList.add('hidden')
          document.body.style.overflow = ''
          document.body.classList.remove('modal-open')
        })
        
        const copyBtn = document.getElementById('copy-json-btn')
        if (copyBtn) {
          copyBtn.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
              const originalText = copyBtn.textContent
              copyBtn.textContent = 'Copied!'
              copyBtn.classList.add('success')
              setTimeout(() => {
                copyBtn.textContent = originalText
                copyBtn.classList.remove('success')
              }, 2000)
            } catch (err) {
              console.error('Failed to copy:', err)
            }
          })
        }
      }
    })
  }
}

boot().catch((e) => {
  console.error('Failed to boot app', e)
})
