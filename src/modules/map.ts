import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MemorialEntry } from './types'
import { currentLanguage } from './i18n'

let map: L.Map
let markersLayer: L.LayerGroup
let selectedCb: (entry: MemorialEntry) => void = () => {}

export function initMap() {
  const container = document.getElementById('map-container')
  if (!container) return

  // Initialize the map centered on Iran
  map = L.map('map-container', {
    center: [32.4279, 53.688], // Center of Iran
    zoom: 5,
    minZoom: 5,
    maxZoom: 10,
    zoomControl: true,
    attributionControl: true
  })

  // Use a dark, minimalist tile layer (CartoDB Dark Matter)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map)

  markersLayer = L.layerGroup().addTo(map)
}

export function plotMarkers(entries: MemorialEntry[]) {
  if (!markersLayer) {
    return
  }
  markersLayer.clearLayers()

  const seenCoords = new Set<string>()

  entries.forEach((entry) => {
    if (!entry.coords) return
    let { lat, lon } = entry.coords

    // Add a tiny jitter if coordinates are identical to avoid stacking
    const coordKey = `${lat.toFixed(4)},${lon.toFixed(4)}`
    if (seenCoords.has(coordKey)) {
      lat += (Math.random() - 0.5) * 0.01
      lon += (Math.random() - 0.5) * 0.01
    }
    seenCoords.add(coordKey)
    
    // Create a custom red dot marker
    const marker = L.circleMarker([lat, lon], {
      radius: 8,
      fillColor: '#ff0000',
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8
    })

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
    map.setView([entry.coords.lat, entry.coords.lon], 8)
  }
}
