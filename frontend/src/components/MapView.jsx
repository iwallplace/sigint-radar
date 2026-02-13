import { useEffect, useState, useRef } from "react"
import { useI18n } from "../i18n"
import { getCategoryStyle } from "../utils/colorMapper"
import "leaflet/dist/leaflet.css"

const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
const TILE_ATTR = '&copy; <a href="https://carto.com/">CARTO</a>'

export default function MapView({ station, signals = [], selectedId, onSelect, radarRange = 200 }) {
  const { t } = useI18n()
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const circlesRef = useRef([])
  const stationMarkerRef = useRef(null)
  const leafletReady = useRef(false)

  const lat = station?.lat || 0
  const lon = station?.lon || 0

  // Initialize Leaflet map
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

    // Dynamic import: Leaflet is already in package.json
    import("leaflet").then((L) => {
      // Fix default marker icon
      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      })

      const map = L.map(containerRef.current, {
        center: [lat, lon],
        zoom: 8,
        zoomControl: true,
        attributionControl: true,
      })

      L.tileLayer(TILE_URL, {
        attribution: TILE_ATTR,
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map)

      mapRef.current = map
      leafletReady.current = true
      window.__leaflet = L
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        leafletReady.current = false
      }
    }
  }, [])

  // Update station marker and distance circles
  useEffect(() => {
    if (!leafletReady.current || !mapRef.current) return
    const L = window.__leaflet
    const map = mapRef.current

    // Remove old station marker and circles
    if (stationMarkerRef.current) {
      stationMarkerRef.current.remove()
    }
    circlesRef.current.forEach((c) => c.remove())
    circlesRef.current = []

    if (lat === 0 && lon === 0) return

    // Station marker
    const stationIcon = L.divIcon({
      html: `<div style="color:#22c55e;font-size:20px;text-align:center;">📡</div>`,
      className: "",
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    })
    stationMarkerRef.current = L.marker([lat, lon], { icon: stationIcon })
      .addTo(map)
      .bindPopup(`<b>${station?.name || "Station"}</b><br/>
        ${lat.toFixed(4)}, ${lon.toFixed(4)}`)

    // Distance circles (FSPL reference)
    const distances = [20, 50, 100]
    distances.forEach((km) => {
      const circle = L.circle([lat, lon], {
        radius: km * 1000,
        color: "#4ade80",
        fillColor: "transparent",
        weight: 1,
        opacity: 0.3,
        dashArray: "5 5",
      }).addTo(map)
      circle.bindTooltip(`${km} km`, { permanent: false })
      circlesRef.current.push(circle)
    })

    map.setView([lat, lon], 8)
  }, [lat, lon, station?.name])

  // Update signal markers
  useEffect(() => {
    if (!leafletReady.current || !mapRef.current) return
    const L = window.__leaflet
    const map = mapRef.current

    // Remove old markers
    Object.values(markersRef.current).forEach((m) => m.remove())
    markersRef.current = {}

    signals.forEach((s) => {
      const cat = getCategoryStyle(s.category)
      let markerLat, markerLon

      // If signal has GPS (aircraft), use real position
      if (s.aircraft?.lat && s.aircraft?.lon) {
        markerLat = s.aircraft.lat
        markerLon = s.aircraft.lon
      } else if (lat !== 0 || lon !== 0) {
        // Place on distance circle using frequency as angle seed
        const distance = s.estimated_distance_km || 10
        const angle = ((s.freq_hz || 0) * 137.508) % 360
        const rad = (angle * Math.PI) / 180
        const dLat = (distance / 111) * Math.cos(rad)
        const dLon =
          (distance / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(rad)
        markerLat = lat + dLat
        markerLon = lon + dLon
      } else {
        return
      }

      const isSelected = s.id === selectedId
      const iconHtml = `<div style="
        color:${cat.color};
        font-size:${isSelected ? "18px" : "14px"};
        text-align:center;
        filter:${isSelected ? "drop-shadow(0 0 4px " + cat.color + ")" : "none"};
      ">${cat.icon}</div>`

      const icon = L.divIcon({
        html: iconHtml,
        className: "",
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      })

      const marker = L.marker([markerLat, markerLon], { icon })
        .addTo(map)
        .bindPopup(
          `<b>${s.protocol || "Unknown"}</b><br/>
          ${(s.freq_hz / 1e6).toFixed(3)} MHz<br/>
          ${s.power_db?.toFixed(1)} dB | ${s.estimated_distance_km?.toFixed(1)} km`
        )

      marker.on("click", () => onSelect?.(s.id))
      markersRef.current[s.id] = marker
    })
  }, [signals, selectedId, lat, lon, onSelect])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-800">
        <h2 className="text-sm font-bold tracking-widest text-green-400">
          {t("map.title")}
        </h2>
        <span className="text-xs text-gray-500">
          {signals.length} {t("app.signals")}
        </span>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  )
}
