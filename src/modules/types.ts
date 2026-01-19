export type MemorialEntry = {
  id?: string
  name: string
  name_fa?: string
  city: string
  city_fa?: string
  location: string
  location_fa?: string
  date: string
  coords?: { lat: number; lon: number }
  bio?: string
  bio_fa?: string
  testimonials?: string[]
  testimonials_fa?: string[]
  media?: {
    photo?: string
    video?: string
    xPost?: string
  }
  references?: {
    label: string
    url: string
  }[]
  verified?: boolean
  sensitive?: boolean
  sensitiveMedia?: boolean
  created_at?: string
}

export interface TwitterWidgets {
  load: (element?: HTMLElement) => void;
}

export interface Twitter {
  ready: (callback: (twttr: { widgets: TwitterWidgets }) => void) => void;
  widgets: TwitterWidgets;
  _e?: unknown[];
}

declare global {
  interface Window {
    twttr: Twitter;
  }
}

