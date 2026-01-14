import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type { MemorialEntry } from './types'
import { currentLanguage } from './i18n'

let map: L.Map
let markersLayer: L.MarkerClusterGroup
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
  
  // @ts-expect-error - leaflet.markercluster extends L but types might not be perfectly matched
  markersLayer = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 40,
    spiderfyOnMaxZoom: true,
    disableClusteringAtZoom: 14,
    iconCreateFunction: (cluster: L.MarkerCluster) => {
      const count = cluster.getChildCount();
      return L.divIcon({
        html: `<div class="custom-cluster"><span>${count}</span></div>`,
        className: 'marker-cluster-custom',
        iconSize: L.point(40, 40)
      });
    }
  }).addTo(map)
}

export function plotMarkers(entries: MemorialEntry[]) {
  if (!markersLayer) {
    return
  }
  markersLayer.clearLayers()

  entries.forEach((entry) => {
    if (!entry.coords) return
    const { lat, lon } = entry.coords

    // Create a marker with a divIcon that looks like the red dot
    const icon = L.divIcon({
      className: 'custom-marker-icon',
      html: '<div class="red-dot"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    })

    const marker = L.marker([lat, lon], { icon })

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
