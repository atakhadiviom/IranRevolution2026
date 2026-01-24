import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type { MemorialEntry } from './types'
import { currentLanguage } from './i18n'

interface MemorialMarker extends L.Marker {
  entry: MemorialEntry
}

let map: L.Map
let markersLayer: L.MarkerClusterGroup
let selectedCb: (entry: MemorialEntry) => void = () => {}

export function initMap() {
  const container = document.getElementById('map-container')
  if (!container) {
    console.error('Map container element not found!')
    return
  }

  try {
    // Initialize the map centered on Iran
    map = L.map('map-container', {
      center: [32.4279, 53.688], // Center of Iran
      zoom: 5,
      minZoom: 5,
      maxZoom: 18,
      zoomControl: true,
      attributionControl: true
    })

    // Use a dark, minimalist tile layer (CartoDB Dark Matter)
    const tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    })
    
    tileLayer.on('tileerror', (e) => {
      console.error('Map tile loading error:', e)
    })
    
    tileLayer.addTo(map)
    
    markersLayer = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: false, 
      zoomToBoundsOnClick: false, 
      spiderfyDistanceMultiplier: 2,
      disableClusteringAtZoom: 18, 
      iconCreateFunction: (cluster: L.MarkerCluster) => {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div class="custom-cluster"><span>${count}</span></div>`,
          className: 'marker-cluster-custom',
          iconSize: L.point(40, 40)
        });
      }
    }).addTo(map)

    // Handle cluster click to show list pop-up
    markersLayer.on('clusterclick', (a) => {
      const cluster = a.layer as L.MarkerCluster
      const markers = cluster.getAllChildMarkers() as MemorialMarker[]
      const entries = markers.map(m => m.entry).filter(Boolean) as MemorialEntry[]
      
      showListView(entries)
    })

    // Fix for map not appearing correctly until resized
    setTimeout(() => {
      map.invalidateSize()
    }, 100)

  } catch (err) {
    console.error('Error initializing Leaflet map:', err)
  }
}

let listViewCb: (entries: MemorialEntry[]) => void = () => {}

export function onShowListView(cb: (entries: MemorialEntry[]) => void) {
  listViewCb = cb
}

function showListView(entries: MemorialEntry[]) {
  listViewCb(entries)
}

export function plotMarkers(entries: MemorialEntry[]) {
  if (!markersLayer) {
    return
  }
  markersLayer.clearLayers()

  // Group entries by exact coordinates to identify overlaps
  const coordGroups = new Map<string, number>()

  entries.forEach((entry) => {
    if (!entry.coords) return
    const { lat, lon } = entry.coords
    const coordKey = `${lat.toFixed(6)},${lon.toFixed(6)}`
    
    // Count how many markers are at this exact location
    const count = coordGroups.get(coordKey) || 0
    coordGroups.set(coordKey, count + 1)

    // Apply a small random jitter if there are multiple markers at the same spot
    // This spreads them out slightly so they don't sit perfectly on top of each other
    let finalLat = lat
    let finalLon = lon
    
    if (count > 0) {
      // Offset by roughly 50-100 meters randomly for better separation
      const jitterAmount = 0.0008 
      finalLat += (Math.random() - 0.5) * jitterAmount * count
      finalLon += (Math.random() - 0.5) * jitterAmount * count
    }

    // Create a marker with a divIcon that looks like the red dot
    const icon = L.divIcon({
      className: 'custom-marker-icon',
      html: '<div class="red-dot"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    })

    const marker = L.marker([finalLat, finalLon], { icon }) as MemorialMarker
    marker.entry = entry

    // Use bilingual fields for tooltip
    const isFa = currentLanguage() === 'fa'
    const displayName = (isFa && entry.name_fa) ? entry.name_fa : entry.name
    const displayCity = (isFa && entry.city_fa) ? entry.city_fa : entry.city

    marker.bindTooltip(`${displayName} • ${displayCity}`, {
      direction: 'top',
      offset: [0, -5]
    })

    marker.on('click', () => {
      selectedCb(entry)
    })

    marker.addTo(markersLayer)
  })
}

export function onMarkerSelected(cb: (entry: MemorialEntry) => void) {
  selectedCb = cb
}

export function focusOnMarker(entry: MemorialEntry) {
  if (map && entry.coords) {
    map.setView([entry.coords.lat, entry.coords.lon], 15)
    
    // Find the marker and open its tooltip to "show the dot" clearly
     markersLayer.eachLayer((layer: L.Layer) => {
       const marker = layer as MemorialMarker
       if (marker.entry && marker.entry.id === entry.id) {
         if (marker.openTooltip) {
           marker.openTooltip()
         }
       }
     })
  }
}
