export type MemorialEntry = {
  id?: string
  name: string
  city: string
  location: string
  date: string
  coords?: { lat: number; lon: number }
  bio?: string
  testimonials?: string[]
  media?: {
    photo?: string
    video?: string
    xPost?: string
  }
  references?: {
    label: string
    url: string
  }[]
}

export interface TwitterWidgets {
  load: (element?: HTMLElement) => void;
}

export interface Twitter {
  ready: (callback: (twttr: { widgets: TwitterWidgets }) => void) => void;
  widgets: TwitterWidgets;
}

declare global {
  interface Window {
    twttr: Twitter;
  }
}

