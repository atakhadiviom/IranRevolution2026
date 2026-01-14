export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      memorials: {
        Row: {
          id: string
          created_at: string
          name: string
          name_fa: string | null
          city: string
          city_fa: string | null
          location: string | null
          location_fa: string | null
          date: string
          coords: Json // { lat: number, lon: number }
          bio: string
          bio_fa: string | null
          testimonials: Json | null
          media: Json | null // { photo?: string, xPost?: string }
          source_links: Json[] | null // { label: string, url: string }[]
          verified: boolean
          submitted_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          name: string
          name_fa?: string | null
          city: string
          city_fa?: string | null
          location?: string | null
          location_fa?: string | null
          date: string
          coords: Json
          bio: string
          bio_fa?: string | null
          testimonials?: Json | null
          media?: Json | null
          source_links?: Json[] | null
          verified?: boolean
          submitted_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          name?: string
          name_fa?: string | null
          city?: string
          city_fa?: string | null
          location?: string | null
          location_fa?: string | null
          date?: string
          coords?: Json
          bio?: string
          bio_fa?: string | null
          testimonials?: Json | null
          media?: Json | null
          source_links?: Json[] | null
          verified?: boolean
          submitted_by?: string | null
        }
      }
    }
    Views: {
      [_: string]: never
    }
    Functions: {
      [_: string]: never
    }
    Enums: {
      [_: string]: never
    }
  }
}
