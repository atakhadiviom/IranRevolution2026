type Dictionary = Record<string, string>
let dict: Dictionary = {}
let lang: 'en' | 'fa' = 'en'

export async function loadTranslations(l: 'en' | 'fa') {
  lang = l
  const res = await fetch(`/i18n/${l}.json`)
  dict = await res.json()
  document.documentElement.lang = l
  document.documentElement.dir = l === 'fa' ? 'rtl' : 'ltr'
}

export function currentLanguage() {
  return lang
}

export async function setLanguage(l: 'en' | 'fa') {
  await loadTranslations(l)
}

export function t(key: string, params?: Record<string, string>) {
  let v = dict[key] ?? key
  if (params) {
    for (const [k, val] of Object.entries(params)) {
      v = v.replaceAll(`{${k}}`, val)
    }
  }
  return v
}

