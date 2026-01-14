import './style.css'
import { loadTranslations, t, setLanguage, currentLanguage } from './modules/i18n'
import { initMap, plotMarkers, onMarkerSelected } from './modules/map'
import type { MemorialEntry } from './modules/types'
import { setupSearch } from './modules/search'
import { extractMemorialData } from './modules/ai'

let currentMemorials: MemorialEntry[] = []

async function boot() {
  await loadTranslations(currentLanguage())
  const memorials: MemorialEntry[] = await fetch(`${import.meta.env.BASE_URL}data/memorials.json`).then((r) => r.json())
  currentMemorials = memorials

  initUiText()
  initLanguageSwitcher(memorials)
  initMap()
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

function initUiText() {
  const title = document.getElementById('site-title')
  const searchInput = document.getElementById('search-input') as HTMLInputElement
  const footerNote = document.getElementById('footer-note')
  const privacyLink = document.getElementById('privacy-link') as HTMLAnchorElement

  if (title) title.textContent = t('site.title')
  if (searchInput) searchInput.placeholder = t('search.placeholder')
  if (footerNote) footerNote.textContent = t('site.footerNote')
  if (privacyLink) privacyLink.textContent = t('site.privacy')
}

function initLanguageSwitcher(memorials: MemorialEntry[]) {
  const select = document.getElementById('language-select') as HTMLSelectElement
  select.addEventListener('change', async () => {
    await setLanguage(select.value as 'en' | 'fa')
    initUiText()
    plotMarkers(memorials)
    clearDetails(memorials)
    document.documentElement.dir = select.value === 'fa' ? 'rtl' : 'ltr'
    document.documentElement.lang = select.value
  })
}

function renderDetails(entry: MemorialEntry) {
  const panel = document.getElementById('details-content')!
  const date = new Date(entry.date).toLocaleDateString(currentLanguage() === 'fa' ? 'fa-IR' : 'en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })
  
  panel.innerHTML = `
    <button id="close-details" class="close-button" aria-label="${t('details.close')}">&times;</button>
    <article class="memorial-profile">
      <header class="profile-header">
        <h2>${entry.name}</h2>
        <p class="profile-meta">
          <strong>${t('details.city')}:</strong> ${entry.city}<br>
          <strong>${t('details.date')}:</strong> ${date}<br>
          <strong>${t('details.location')}:</strong> ${entry.location}
        </p>
      </header>

      ${entry.media?.photo ? `
        <figure class="profile-photo">
          <img src="${entry.media.photo}" alt="${t('details.photoAlt', { name: entry.name })}" loading="lazy" />
          <figcaption class="photo-attribution">${t('details.photoAttribution')}</figcaption>
        </figure>
      ` : ''}

      <div class="profile-bio">
        ${entry.bio ? `<p>${entry.bio}</p>` : ''}
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

      ${entry.testimonials?.length ? `
        <section class="profile-testimonials">
          <h3>${t('details.testimonials')}</h3>
          ${entry.testimonials.map((s) => `<blockquote>${s}</blockquote>`).join('')}
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
  const overlay = document.getElementById('modal-overlay')
  const close = document.getElementById('close-modal')
  const body = document.getElementById('modal-body')

  if (!btn || !overlay || !close || !body) return

  btn.addEventListener('click', () => {
    overlay.classList.remove('hidden')
    renderForm()
  })

  close.addEventListener('click', () => {
    overlay.classList.add('hidden')
  })

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.add('hidden')
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
              <input type="text" name="city" placeholder="City (optional)">
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

    const checkDuplicate = (name: string) => {
      if (!name || name.length < 3) {
        duplicateWarning.classList.add('hidden')
        return
      }

      const normalizedSearch = name.toLowerCase().trim()
      const match = currentMemorials.find(m => 
        m.name.toLowerCase().trim() === normalizedSearch ||
        m.name.toLowerCase().trim().includes(normalizedSearch)
      )

      if (match) {
        duplicateWarning.innerHTML = `
          <p>⚠️ ${t('contribute.duplicateWarning')}</p>
          <button type="button" class="view-duplicate-btn" data-id="${match.id}">
            ${t('contribute.duplicateAction')}: <strong>${match.name}</strong>
          </button>
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

    aiBtn?.addEventListener('click', async () => {
      const url = aiUrl.value.trim()
      if (!url) return

      aiBtn.disabled = true
      aiBtn.innerHTML = `⏳ ${t('ai.processing')}`
      aiStatus.textContent = t('ai.fetching')
      aiStatus.className = 'ai-status'
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
        aiBtn.disabled = false
        aiBtn.innerHTML = `✨ ${t('ai.button')}`
      }
    })

    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const fd = new FormData(form)
      const data = {
        name: fd.get('name'),
        city: fd.get('city'),
        date: fd.get('date'),
        location: fd.get('location'),
        bio: fd.get('bio'),
        media: {
          xPost: fd.get('refUrl')?.toString().includes('x.com') || fd.get('refUrl')?.toString().includes('twitter.com') 
            ? fd.get('refUrl') 
            : undefined
        },
        references: [{
          label: fd.get('refLabel') || 'Reference',
          url: fd.get('refUrl')
        }]
      }

      body!.innerHTML = `
        <div class="submission-result">
          <h3>${t('contribute.successTitle')}</h3>
          <p>${t('contribute.successDesc')}</p>
          <code>${JSON.stringify(data, null, 2)}</code>
          <p>${t('contribute.nextSteps')}</p>
          <a href="https://github.com/atakhadiviom/IranRevolution2026/issues/new?title=New+Memorial+Submission&body=${encodeURIComponent('Please add this person to the memorial:\n\n```json\n' + JSON.stringify(data, null, 2) + '\n```')}" 
             target="_blank" class="nav-button" style="display:inline-block; margin-top:1rem;">
             Open GitHub Issue
          </a>
        </div>
      `
    })
  }
}

boot().catch((e) => {
  console.error('Failed to boot app', e)
})
