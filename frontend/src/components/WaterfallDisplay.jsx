import { useRef, useEffect, useState, useCallback } from "react"
import { useI18n } from "../i18n"

const COLOR_STOPS = [
  { db: -100, r: 0, g: 0, b: 40 },
  { db: -80, r: 0, g: 80, b: 200 },
  { db: -60, r: 0, g: 200, b: 80 },
  { db: -40, r: 200, g: 200, b: 0 },
  { db: -20, r: 255, g: 50, b: 0 },
  { db: 0, r: 255, g: 255, b: 255 },
]

function dbToColor(db) {
  if (db <= COLOR_STOPS[0].db) return COLOR_STOPS[0]
  if (db >= COLOR_STOPS[COLOR_STOPS.length - 1].db)
    return COLOR_STOPS[COLOR_STOPS.length - 1]

  for (let i = 1; i < COLOR_STOPS.length; i++) {
    if (db <= COLOR_STOPS[i].db) {
      const prev = COLOR_STOPS[i - 1]
      const next = COLOR_STOPS[i]
      const t = (db - prev.db) / (next.db - prev.db)
      return {
        r: Math.round(prev.r + (next.r - prev.r) * t),
        g: Math.round(prev.g + (next.g - prev.g) * t),
        b: Math.round(prev.b + (next.b - prev.b) * t),
      }
    }
  }
  return COLOR_STOPS[0]
}

export default function WaterfallDisplay({ bands = [], spectrumData, selectedBand, onBandSelect }) {
  const { t } = useI18n()
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const [activeBand, setActiveBand] = useState(selectedBand || "")
  const linesRef = useRef([])
  const maxLines = 200

  useEffect(() => {
    if (selectedBand) setActiveBand(selectedBand)
  }, [selectedBand])

  // Append new spectrum line when data arrives for the active band
  useEffect(() => {
    if (!spectrumData) return
    if (activeBand && spectrumData.band !== activeBand) return

    const line = {
      freqs: spectrumData.freqs,
      power_db: spectrumData.power_db,
      band: spectrumData.band,
      ts: Date.now(),
    }
    linesRef.current.push(line)
    if (linesRef.current.length > maxLines) {
      linesRef.current = linesRef.current.slice(-maxLines)
    }
  }, [spectrumData, activeBand])

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    let raf

    function draw() {
      const lines = linesRef.current
      const w = canvas.width
      const h = canvas.height

      if (lines.length === 0) {
        ctx.fillStyle = "#030712"
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = "#4b5563"
        ctx.font = "14px monospace"
        ctx.textAlign = "center"
        ctx.fillText(t("waterfall.waiting"), w / 2, h / 2)
        raf = requestAnimationFrame(draw)
        return
      }

      // Each line is 1 row of pixels from top (newest) to bottom (oldest)
      const lineHeight = Math.max(1, Math.floor(h / maxLines))
      const visible = Math.min(lines.length, Math.floor(h / lineHeight))

      // Shift existing content down
      ctx.drawImage(canvas, 0, 0, w, h - lineHeight, 0, lineHeight, w, h - lineHeight)

      // Draw newest line at top
      const newest = lines[lines.length - 1]
      const bins = newest.power_db.length
      const binWidth = w / bins

      for (let i = 0; i < bins; i++) {
        const color = dbToColor(newest.power_db[i])
        ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`
        ctx.fillRect(Math.floor(i * binWidth), 0, Math.ceil(binWidth) + 1, lineHeight)
      }

      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(raf)
  }, [t])

  // Resize canvas to container
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const ro = new ResizeObserver(() => {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
    })
    ro.observe(container)
    canvas.width = container.clientWidth
    canvas.height = container.clientHeight
    return () => ro.disconnect()
  }, [])

  const handleMouseMove = useCallback(
    (e) => {
      const canvas = canvasRef.current
      const lines = linesRef.current
      if (!canvas || lines.length === 0) return

      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const newest = lines[lines.length - 1]
      const bins = newest.freqs.length
      const idx = Math.floor((x / rect.width) * bins)

      if (idx >= 0 && idx < bins) {
        const freq = newest.freqs[idx]
        const power = newest.power_db[idx]
        setTooltip({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          freq: (freq / 1e6).toFixed(3),
          power: power.toFixed(1),
        })
      }
    },
    [],
  )

  const handleMouseLeave = useCallback(() => setTooltip(null), [])

  const handleBandChange = (e) => {
    const band = e.target.value
    setActiveBand(band)
    linesRef.current = []
    onBandSelect?.(band)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-800">
        <h2 className="text-sm font-bold tracking-widest text-green-400">
          {t("waterfall.title")}
        </h2>
        <select
          value={activeBand}
          onChange={handleBandChange}
          className="bg-gray-900 text-green-400 text-xs px-2 py-1 rounded border border-gray-700"
        >
          <option value="">{t("waterfall.all_bands")}</option>
          {bands.map((b) => (
            <option key={b.name} value={b.name}>
              {b.description} ({b.center_mhz.toFixed(1)} MHz)
            </option>
          ))}
        </select>
        {activeBand && (
          <span className="text-xs text-gray-500">
            {t("waterfall.band_filter")}: {activeBand}
          </span>
        )}
      </div>

      {/* Color legend */}
      <div className="flex items-center gap-2 px-4 py-1 border-b border-gray-800">
        <span className="text-xs text-gray-500">dB:</span>
        <div className="flex h-3 flex-1 max-w-xs rounded overflow-hidden">
          {COLOR_STOPS.map((stop, i) => (
            <div
              key={i}
              className="flex-1"
              style={{ backgroundColor: `rgb(${stop.r},${stop.g},${stop.b})` }}
            />
          ))}
        </div>
        <span className="text-xs text-gray-500">-100</span>
        <span className="text-xs text-gray-500">0</span>
      </div>

      {/* Waterfall canvas */}
      <div ref={containerRef} className="flex-1 relative cursor-crosshair min-h-0">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="absolute inset-0"
        />
        {tooltip && (
          <div
            className="absolute pointer-events-none bg-black/80 text-green-400 text-xs px-2 py-1 rounded border border-gray-700 z-10"
            style={{ left: tooltip.x + 12, top: tooltip.y - 30 }}
          >
            {tooltip.freq} MHz | {tooltip.power} dB
          </div>
        )}
      </div>
    </div>
  )
}
