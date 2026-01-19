import { supabase } from './supabase'
import { extractXPostImage } from './imageExtractor'
import { translateMemorialData, geocodeLocation, reverseGeocode } from './ai'
import type { MemorialEntry } from './types'
import type { Database } from './database.types'

type MemorialRow = Database['public']['Tables']['memorials']['Row']

export async function mergeMemorials(sourceId: string, targetId: string): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' }
  try {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    // 1. Get both entries
    const { data: source, error: sourceError } = await (supabase as any)
      .from('memorials')
      .select('*')
      .eq('id', sourceId)
      .single()
    
    const { data: target, error: targetError } = await (supabase as any)
      .from('memorials')
      .select('*')
      .eq('id', targetId)
      .single()

    if (sourceError || targetError || !source || !target) {
      return { success: false, error: 'Could not find source or target entry.' }
    }

    // 2. Combine references
    const sourceRefs = (source.source_links as any[]) || []
    const targetRefs = (target.source_links as any[]) || []
    
    const refsToAdd = sourceRefs.filter(newR => !targetRefs.some(currR => currR.url === newR.url))
    
    if (refsToAdd.length > 0) {
      const updatedRefs = [...targetRefs, ...refsToAdd]
      const { error: updateError } = await (supabase as any)
        .from('memorials')
        .update({ source_links: updatedRefs })
        .eq('id', targetId)
      
      if (updateError) return { success: false, error: updateError.message }
    }

    // 3. Delete the source entry
    const { error: deleteError } = await (supabase as any)
      .from('memorials')
      .delete()
      .eq('id', sourceId)

    if (deleteError) return { success: false, error: deleteError.message }
    
    return { success: true }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function fetchMemorials(includeUnverified = false): Promise<MemorialEntry[]> {
  if (!supabase) return fetchStaticMemorials()
  try {
    let query = supabase
      .from('memorials')
      .select('*')
      .order('date', { ascending: false })

    if (!includeUnverified) {
      query = query.eq('verified', true)
    }

    const { data, error } = await query

    if (error) {
      return fetchStaticMemorials()
    }

    if (data === null) {
      return fetchStaticMemorials()
    }

    return data.map(mapRowToEntry)
  } catch (e) {
    return fetchStaticMemorials()
  }
}

export async function verifyMemorial(id: string): Promise<{ success: boolean; merged?: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' }
  try {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    // 1. Get the current entry
    const { data: current, error: fetchError } = await (supabase as any)
      .from('memorials')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !current) {
      return { success: false, error: fetchError?.message || 'Entry not found' }
    }

    // 2. Check if another entry with the same name is ALREADY VERIFIED
    const { data: existing, error: checkError } = await (supabase as any)
      .from('memorials')
      .select('*')
      .eq('name', current.name)
      .eq('verified', true)
      .neq('id', id)
      .maybeSingle()

    if (checkError) {
      console.error('Duplicate check error during verification:', checkError)
    }

    if (existing) {
      // 3. MERGE: Add references from current to existing
      const currentRefs = (current.source_links as any[]) || []
      const existingRefs = (existing.source_links as any[]) || []
      
      const refsToAdd = currentRefs.filter(newR => !existingRefs.some(currR => currR.url === newR.url))
      
      if (refsToAdd.length > 0) {
        const updatedRefs = [...existingRefs, ...refsToAdd]
        const { error: updateError } = await (supabase as any)
          .from('memorials')
          .update({ source_links: updatedRefs })
          .eq('id', existing.id)
        
        if (updateError) return { success: false, error: updateError.message }
      }

      // 4. Delete the duplicate pending entry
      await (supabase as any).from('memorials').delete().eq('id', id)
      
      return { success: true, merged: true }
    }

    // 5. Standard verification if no duplicate found
    const { error } = await (supabase as any)
      .from('memorials')
      .update({ verified: true })
      .eq('id', id)

    if (error) return { success: false, error: error.message }
    return { success: true }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function deleteMemorial(id: string): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' }
  try {
    const { error } = await supabase
      .schema('public')
      .from('memorials')
      .delete()
      .eq('id', id)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function submitReport(report: { memorial_id: string; memorial_name: string; reason: string; details: string }): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' }
  try {
    // If table doesn't exist or is not configured for public insert, this will fail
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { error } = await (supabase as any)
      .from('reports')
      .insert([report])
    
    if (error) {
      console.error('Report submission error:', error)
      // Check for common error types
      if (error.code === '42P01') return { success: false, error: 'Database error: reports table not found. Please contact admin.' }
      if (error.code === '42501') return { success: false, error: 'Permission denied: Public submissions for reports are not allowed yet.' }
      return { success: false, error: error.message }
    }
    return { success: true }
  } catch (e) {
    console.error('Report submission exception:', e)
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export async function fetchReports(): Promise<{ data: any[]; error?: string }> {
  if (!supabase) return { data: [], error: 'Supabase not configured' }
  try {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { data, error } = await (supabase as any)
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching reports:', error)
      return { data: [], error: error.message }
    }

    return { data: data || [] }
  } catch (e) {
    console.error('Exception fetching reports:', e)
    return { data: [], error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function deleteReport(id: string): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' }
  try {
    const { error } = await supabase
      .from('reports')
      .delete()
      .eq('id', id)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function updateReportStatus(id: string, status: 'pending' | 'resolved' | 'dismissed'): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' }
  try {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { data, error } = await (supabase as any)
      .from('reports')
      .update({ status })
      .eq('id', id)
      .select()

    if (error) {
      console.error('Update error:', error)
      return { success: false, error: error.message }
    }
    
    if (!data || data.length === 0) {
      return { success: false, error: 'No report found or permission denied.' }
    }
    
    return { success: true }
  } catch (e) {
    console.error('Update exception:', e)
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function submitMemorial(entry: Partial<MemorialEntry>): Promise<{ success: boolean; merged?: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Database connection not available.' }
  }
  try {
    if (!entry.name) {
      return { success: false, error: 'Name is required.' }
    }

    const hasLink = entry.media?.xPost || (entry.references && entry.references.length > 0)
    if (!hasLink) {
      return { success: false, error: 'At least one link (X Post URL or a Reference) is required.' }
    }

    const isEditing = !!entry.id
    
    // Check for duplicates if this is a new entry
    if (!isEditing) {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const { data: existing, error: checkError } = await (supabase as any)
        .from('memorials')
        .select('id, name, source_links, verified')
        .eq('name', entry.name)
        .maybeSingle()

      if (checkError) {
        console.error('Duplicate check error:', checkError);
      } else if (existing) {
        // MERGE LOGIC: If person exists, add the new references to their record
        const newRefs = entry.references || []
        if (newRefs.length > 0) {
          const currentRefs = ((existing as any).source_links as any[]) || []
          
          // Filter out references that already exist (by URL)
          const refsToAdd = newRefs.filter(newR => !currentRefs.some(currR => currR.url === newR.url))
          
          if (refsToAdd.length > 0) {
            const updatedRefs = [...currentRefs, ...refsToAdd]
            const { error: updateError } = await (supabase as any)
              .from('memorials')
              .update({ 
                source_links: updatedRefs,
              })
              .eq('id', (existing as any).id)
            
            if (updateError) return { success: false, error: updateError.message }
            return { success: true, merged: true } // Successfully merged
          } else {
            return { success: false, error: 'These references already exist for this person.' }
          }
        }
      }
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }

    const id = entry.id || entry.name?.toLowerCase().trim().replace(/\s+/g, '-') || `submission-${Date.now()}`
    
    // Auto-extract image from X post if missing
    if (entry.media?.xPost && !entry.media?.photo) {
      try {
        const photo = await extractXPostImage(entry.media.xPost);
        if (photo) {
          if (!entry.media) entry.media = {};
          entry.media.photo = photo;
        }
      } catch (e) {
        // Silently fail auto-extraction
      }
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const dataToSave: any = {
      id,
      name: entry.name || 'Unknown',
      name_fa: entry.name_fa || null,
      city: entry.city || 'Unknown',
      city_fa: entry.city_fa || null,
      location: entry.location || '',
      location_fa: entry.location_fa || null,
      date: entry.date || new Date().toISOString().split('T')[0],
      bio: entry.bio || '',
      bio_fa: entry.bio_fa || null,
      coords: (entry.coords || { lat: 35.6892, lon: 51.3890 }),
      media: (entry.media || {}),
      source_links: (entry.references || []),
      testimonials: (entry.testimonials || []),
      verified: entry.verified ?? false
    }

    // If editing, we might want to be careful about what we overwrite if fields are missing.
    // But for now, the admin panel sends the full state.

    const { error } = await (supabase as any)
      .from('memorials')
      .upsert(dataToSave)
    /* eslint-enable @typescript-eslint/no-explicit-any */

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function batchUpdateImages(): Promise<{ success: boolean; count: number; error?: string }> {
  if (!supabase) return { success: false, count: 0, error: 'Supabase not configured' }
  
  try {
    const { data: memorials, error: fetchError } = await supabase
      .from('memorials')
      .select('*')
    
    if (fetchError) throw fetchError
    
    const rows = (memorials || []) as MemorialRow[]
    const targets = rows.filter(m => {
      const media = m.media as Record<string, unknown>
      return media?.xPost && !media?.photo
    })
    
    if (targets.length === 0) return { success: true, count: 0 }
    
    let updatedCount = 0
    for (const m of targets) {
      const media = m.media as Record<string, string>
      const xPost = media?.xPost
      const photo = await extractXPostImage(xPost)
      
      if (photo) {
        const updatedMedia = { ...media, photo }
        const client = supabase as unknown as { 
          from: (t: string) => { 
            update: (d: Record<string, unknown>) => { 
              eq: (f: string, v: string) => Promise<{ error: unknown }> 
            } 
          } 
        }
        const { error: updateError } = await client
          .from('memorials')
          .update({ media: updatedMedia })
          .eq('id', m.id)
          
        if (!updateError) updatedCount++
      }
      
      await new Promise(r => setTimeout(r, 500))
    }
    
    return { success: true, count: updatedCount }
  } catch (e) {
    return { success: false, count: 0, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function batchTranslateMemorials(): Promise<{ success: boolean; count: number; error?: string }> {
  if (!supabase) return { success: false, count: 0, error: 'Supabase not configured' }
  
  try {
    const { data: memorials, error: fetchError } = await supabase
      .from('memorials')
      .select('*')
    
    if (fetchError) throw fetchError
    
    const rows = (memorials || []) as MemorialRow[]
    const targets = rows.filter(m => !m.name_fa || !m.city_fa || !m.bio_fa)
    
    if (targets.length === 0) return { success: true, count: 0 }
    
    let updatedCount = 0
    for (const m of targets) {
      const translation = await translateMemorialData({
        name: m.name,
        city: m.city,
        location: m.location || '',
        bio: m.bio || '',
        name_fa: m.name_fa || undefined,
        city_fa: m.city_fa || undefined,
        location_fa: m.location_fa || undefined,
        bio_fa: m.bio_fa || undefined
      })
      
      if (translation) {
        const client = supabase as unknown as { 
          from: (t: string) => { 
            update: (d: Record<string, unknown>) => { 
              eq: (f: string, v: string) => Promise<{ error: unknown }> 
            } 
          } 
        }
        const { error: updateError } = await client
          .from('memorials')
          .update({
            name: translation.name,
            name_fa: translation.name_fa,
            city: translation.city,
            city_fa: translation.city_fa,
            location: translation.location,
            location_fa: translation.location_fa,
            bio: translation.bio,
            bio_fa: translation.bio_fa
          })
          .eq('id', m.id)
          
        if (!updateError) updatedCount++
      }
      
      // Delay to avoid rate limits
      await new Promise(r => setTimeout(r, 500))
    }
    
    return { success: true, count: updatedCount }
   } catch (e) {
     return { success: false, count: 0, error: e instanceof Error ? e.message : 'Unknown error' }
   }
 }
 
 export async function batchSyncLocationCoords(): Promise<{ success: boolean; count: number; error?: string }> {
  if (!supabase) return { success: false, count: 0, error: 'Supabase not configured' }
  
  try {
    const { data: memorials, error: fetchError } = await supabase.from('memorials').select('*')
    if (fetchError) throw fetchError
    
    const rows = (memorials || []) as MemorialRow[]
    let updatedCount = 0

    for (const m of rows) {
      const update: Record<string, unknown> = {}
      const coords = m.coords as { lat: number; lon: number } | null

      // Case 1: Has Location but missing/default Coordinates
      if (m.city && m.location && (!coords || (coords.lat === 35.6892 && coords.lon === 51.3890))) {
        const newCoords = await geocodeLocation(m.city, m.location)
        if (newCoords) update.coords = newCoords
      }
      // Case 2: Has Coordinates but missing Location text
      else if (coords && (!m.location || m.location === '')) {
        const info = await reverseGeocode(coords.lat, coords.lon)
        if (info) {
          update.location = info.location
          if (!m.city) update.city = info.city
        }
      }

      if (Object.keys(update).length > 0) {
        const client = supabase as unknown as { 
          from: (t: string) => { 
            update: (d: Record<string, unknown>) => { 
              eq: (f: string, v: string) => Promise<{ error: unknown }> 
            } 
          } 
        }
        const { error: updateError } = await client
          .from('memorials')
          .update(update)
          .eq('id', m.id)
          
        if (!updateError) updatedCount++
        await new Promise(r => setTimeout(r, 500))
      }
    }
    
    return { success: true, count: updatedCount }
  } catch (e) {
    return { success: false, count: 0, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

 async function fetchStaticMemorials(): Promise<MemorialEntry[]> {
  try {
    const baseUrl = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.BASE_URL : '/';
    const url = `${baseUrl}data/memorials.json`;
    
    // If we're in Node and it's a relative/absolute path-like URL, try reading from disk
    if (typeof process !== 'undefined' && process.versions && process.versions.node && (url.startsWith('/') || !url.startsWith('http'))) {
      const fs = await import('fs/promises');
      const path = await import('path');
      const fullPath = url.startsWith('/') 
        ? path.join(process.cwd(), 'public', url)
        : path.join(process.cwd(), 'public', 'data', 'memorials.json');
      
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        return JSON.parse(content);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Failed to read static memorials from disk, falling back to fetch', err);
      }
    }

    const response = await fetch(url)
    return response.json()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Error fetching static memorials:', e);
    return [];
  }
}

export function mapRowToEntry(row: MemorialRow): MemorialEntry {
  return {
    id: row.id,
    name: row.name,
    name_fa: row.name_fa || undefined,
    city: row.city,
    city_fa: row.city_fa || undefined,
    location: row.location || '',
    location_fa: row.location_fa || undefined,
    date: row.date,
    coords: row.coords as { lat: number; lon: number },
    bio: row.bio,
    bio_fa: row.bio_fa || undefined,
    testimonials: Array.isArray(row.testimonials) ? (row.testimonials as string[]) : undefined,
    media: row.media as MemorialEntry['media'],
    references: (row.source_links as MemorialEntry['references']) || [],
    verified: row.verified
  }
}

export async function addUrlToQueue(url: string): Promise<{ success: boolean; error?: string; storedIn?: 'supabase' | 'localStorage' | 'file' }> {
  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node
  const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined'
  
  // Priority 1: Try Supabase (works in both browser and Node.js)
  if (supabase) {
    try {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const { error } = await (supabase as any)
        .from('url_queue')
        .insert([{ url, created_at: new Date().toISOString() }])
      
      if (!error) {
        return { success: true, storedIn: 'supabase' }
      }
      
      // If table doesn't exist, fall through to file/localStorage
      if (error.code !== '42P01') {
        return { success: false, error: `Database error: ${error.message}` }
      }
    } catch (e) {
      // Fall through to file/localStorage
    }
  }
  
  // Priority 2: Write to file (Node.js only - for discovery script or server-side)
  if (isNode) {
    try {
      const fs = await import('fs/promises')
      const path = await import('path')
      const queueFile = path.join(process.cwd(), 'public', 'data', 'url_queue.json')
      
      let urls: string[] = []
      try {
        const content = await fs.readFile(queueFile, 'utf-8')
        urls = JSON.parse(content)
      } catch {
        // File doesn't exist, start with empty array
      }
      
      if (!urls.includes(url)) {
        urls.push(url)
        await fs.writeFile(queueFile, JSON.stringify(urls, null, 2))
      }
      
      return { success: true, storedIn: 'file' }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed to add URL to file' }
    }
  }
  
  // Priority 3: Browser fallback - store in localStorage
  // Note: These will need to be manually synced to the file for the discovery script
  if (isBrowser) {
    try {
      const storageKey = 'url_queue'
      const stored = localStorage.getItem(storageKey)
      let urls: string[] = stored ? JSON.parse(stored) : []
      
      if (!urls.includes(url)) {
        urls.push(url)
        localStorage.setItem(storageKey, JSON.stringify(urls))
      }
      
      return { success: true, storedIn: 'localStorage' }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed to add URL to localStorage' }
    }
  }
  
  return { success: false, error: 'Unable to store URL. Please configure Supabase or run in a supported environment.' }
}

export async function getQueuedUrls(): Promise<string[]> {
  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node
  
  // Priority 1: Read from file (this is what the discovery script uses)
  // This is the source of truth for the discovery script
  if (isNode) {
    try {
      const fs = await import('fs/promises')
      const path = await import('path')
      const queueFile = path.join(process.cwd(), 'public', 'data', 'url_queue.json')
      
      try {
        const content = await fs.readFile(queueFile, 'utf-8')
        return JSON.parse(content)
      } catch {
        return []
      }
    } catch {
      return []
    }
  }
  
  // Priority 2: Try Supabase (for browser UI to show queue status)
  if (supabase) {
    try {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const { data, error } = await (supabase as any)
        .from('url_queue')
        .select('url')
        .order('created_at', { ascending: true })
      
      if (!error && data) {
        return (data || []).map((row: { url: string }) => row.url)
      }
    } catch {
      // Fall through to localStorage
    }
  }
  
  // Priority 3: Browser fallback - read from localStorage
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const storageKey = 'url_queue'
      const stored = localStorage.getItem(storageKey)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  }
  
  return []
}

export async function removeUrlsFromQueue(urls: string[]): Promise<{ success: boolean; error?: string }> {
  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node
  const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined'
  
  if (!supabase) {
    // Fallback: try to use file system if in Node.js environment
    if (isNode) {
      try {
        const fs = await import('fs/promises')
        const path = await import('path')
        const queueFile = path.join(process.cwd(), 'public', 'data', 'url_queue.json')
        
        let currentUrls: string[] = []
        try {
          const content = await fs.readFile(queueFile, 'utf-8')
          currentUrls = JSON.parse(content)
        } catch {
          return { success: true } // File doesn't exist, nothing to remove
        }
        
        const remainingUrls = currentUrls.filter((url: string) => !urls.includes(url))
        await fs.writeFile(queueFile, JSON.stringify(remainingUrls, null, 2))
        
        return { success: true }
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Failed to remove URLs' }
      }
    }
    
    // In browser without Supabase, use localStorage
    if (isBrowser) {
      try {
        const storageKey = 'url_queue'
        const stored = localStorage.getItem(storageKey)
        let currentUrls: string[] = stored ? JSON.parse(stored) : []
        
        const remainingUrls = currentUrls.filter((url: string) => !urls.includes(url))
        localStorage.setItem(storageKey, JSON.stringify(remainingUrls))
        
        return { success: true }
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Failed to remove URLs from localStorage' }
      }
    }
    
    return { success: false, error: 'Supabase not configured and not in a supported environment' }
  }
  
  try {
    // Try to use Supabase table 'url_queue' if it exists
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { error } = await (supabase as any)
      .from('url_queue')
      .delete()
      .in('url', urls)
    
    if (error) {
      // If table doesn't exist, fall back to file system (if in Node.js) or localStorage (if in browser)
      if (error.code === '42P01') {
        if (isNode) {
          try {
            const fs = await import('fs/promises')
            const path = await import('path')
            const queueFile = path.join(process.cwd(), 'public', 'data', 'url_queue.json')
            
            let currentUrls: string[] = []
            try {
              const content = await fs.readFile(queueFile, 'utf-8')
              currentUrls = JSON.parse(content)
            } catch {
              return { success: true } // File doesn't exist, nothing to remove
            }
            
            const remainingUrls = currentUrls.filter((url: string) => !urls.includes(url))
            await fs.writeFile(queueFile, JSON.stringify(remainingUrls, null, 2))
            
            return { success: true }
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : 'Failed to remove URLs' }
          }
        } else if (isBrowser) {
          // Fallback to localStorage in browser
          try {
            const storageKey = 'url_queue'
            const stored = localStorage.getItem(storageKey)
            let currentUrls: string[] = stored ? JSON.parse(stored) : []
            
            const remainingUrls = currentUrls.filter((url: string) => !urls.includes(url))
            localStorage.setItem(storageKey, JSON.stringify(remainingUrls))
            
            return { success: true }
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : 'Failed to remove URLs from localStorage' }
          }
        }
      }
      return { success: false, error: error.message }
    }
    
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

