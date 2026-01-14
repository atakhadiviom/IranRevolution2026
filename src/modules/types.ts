export type MemorialEntry = {
  id: string
  name: string
  city: string
  location: string
  date: string
  coords: { lat: number; lon: number }
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

