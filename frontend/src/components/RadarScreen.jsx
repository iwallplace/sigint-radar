import { useRef, useEffect, useCallback } from "react"
import { getSignalColor } from "../utils/colorMapper"

const DIRECTIONS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
const SWEEP_SPEED = 0.015
const TRAIL_LENGTH = 0.7

function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return hash
}

function signalAngle(signal) {
  const seed = hashCode(`${signal.id}-${Math.round(signal.freq_hz / 1000)}`)
  return ((seed % 3600) / 3600) * Math.PI * 2
}

function signalRadius(signal, maxRadius, rangeKm) {
  const dist = signal.estimated_distance_km || 1
  return Math.min((dist / rangeKm) * maxRadius, maxRadius * 0.92)
}

export default function RadarScreen({
  signals = [],
  selectedId,
  onSelect,
  rangeKm = 60,
  stationName = "SIGINT-01",
}) {
  const canvasRef = useRef(null)
  const sweepAngleRef = useRef(0)
  const animRef = useRef(null)
  const containerRef = useRef(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    const w = canvas.width
    const h = canvas.height
    const cx = w / 2
    const cy = h / 2
    const maxR = Math.min(cx, cy) - 50

    // Clear
    ctx.fillStyle = "#060a06"
    ctx.fillRect(0, 0, w, h)

    // Outer ring glow
    const outerGlow = ctx.createRadialGradient(cx, cy, maxR - 5, cx, cy, maxR + 15)
    outerGlow.addColorStop(0, "rgba(34, 197, 94, 0.08)")
    outerGlow.addColorStop(1, "rgba(34, 197, 94, 0)")
    ctx.fillStyle = outerGlow
    ctx.fillRect(0, 0, w, h)

    // Background subtle glow
    const bgGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR)
    bgGlow.addColorStop(0, "rgba(34, 197, 94, 0.03)")
    bgGlow.addColorStop(0.5, "rgba(34, 197, 94, 0.01)")
    bgGlow.addColorStop(1, "rgba(34, 197, 94, 0)")
    ctx.fillStyle = bgGlow
    ctx.beginPath()
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2)
    ctx.fill()

    // Distance rings
    const ringCount = 3
    for (let i = 1; i <= ringCount; i++) {
      const ratio = i / ringCount
      const r = ratio * maxR
      const km = Math.round(ratio * rangeKm)

      ctx.strokeStyle = `rgba(34, 197, 94, ${0.12 + i * 0.03})`
      ctx.lineWidth = 1
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()

      // Distance label
      ctx.fillStyle = "rgba(34, 197, 94, 0.4)"
      ctx.font = "10px monospace"
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillText(`${km} km`, cx + r + 4, cy - 4)
    }

    // Cross lines
    ctx.strokeStyle = "rgba(34, 197, 94, 0.12)"
    ctx.lineWidth = 0.5
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(cx, cy - maxR)
    ctx.lineTo(cx, cy + maxR)
    ctx.moveTo(cx - maxR, cy)
    ctx.lineTo(cx + maxR, cy)
    ctx.stroke()

    // Diagonal lines
    ctx.strokeStyle = "rgba(34, 197, 94, 0.06)"
    ctx.setLineDash([4, 6])
    ctx.beginPath()
    const diagR = maxR * 0.707
    ctx.moveTo(cx - diagR, cy - diagR)
    ctx.lineTo(cx + diagR, cy + diagR)
    ctx.moveTo(cx + diagR, cy - diagR)
    ctx.lineTo(cx - diagR, cy + diagR)
    ctx.stroke()
    ctx.setLineDash([])

    // Compass labels
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI) / 8 - Math.PI / 2
      const isMain = i % 4 === 0
      const isSecondary = i % 2 === 0
      const labelR = maxR + (isMain ? 28 : 22)

      const lx = cx + labelR * Math.cos(angle)
      const ly = cy + labelR * Math.sin(angle)

      if (isMain) {
        ctx.fillStyle = "rgba(34, 197, 94, 0.7)"
        ctx.font = "bold 13px monospace"
      } else if (isSecondary) {
        ctx.fillStyle = "rgba(34, 197, 94, 0.35)"
        ctx.font = "10px monospace"
      } else {
        ctx.fillStyle = "rgba(34, 197, 94, 0.2)"
        ctx.font = "8px monospace"
      }
      ctx.fillText(DIRECTIONS[i], lx, ly)

      // Tick marks
      const tickInner = maxR - (isMain ? 8 : 4)
      const tickOuter = maxR
      ctx.strokeStyle = isMain ? "rgba(34, 197, 94, 0.4)" : "rgba(34, 197, 94, 0.15)"
      ctx.lineWidth = isMain ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(cx + tickInner * Math.cos(angle), cy + tickInner * Math.sin(angle))
      ctx.lineTo(cx + tickOuter * Math.cos(angle), cy + tickOuter * Math.sin(angle))
      ctx.stroke()
    }

    // Sweep line with trail
    const sweep = sweepAngleRef.current
    for (let i = 0; i < 40; i++) {
      const a = sweep - (i / 40) * TRAIL_LENGTH
      const opacity = ((40 - i) / 40) * 0.35
      ctx.strokeStyle = `rgba(34, 197, 94, ${opacity})`
      ctx.lineWidth = i === 0 ? 2.5 : 1.5
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + maxR * Math.cos(a), cy + maxR * Math.sin(a))
      ctx.stroke()
    }

    // Draw signals
    for (const sig of signals) {
      const angle = signalAngle(sig)
      const r = signalRadius(sig, maxR, rangeKm)
      const sx = cx + r * Math.cos(angle)
      const sy = cy + r * Math.sin(angle)

      const ttlRatio = sig.max_ttl > 0 ? (sig.ttl ?? sig.max_ttl) / sig.max_ttl : 1
      const opacity = Math.max(0.2, ttlRatio)
      const color = getSignalColor(sig.category)
      const isWeird = (sig.weirdness_score || 0) >= 40
      const isSelected = sig.id === selectedId

      const visible = !isWeird || Math.floor(Date.now() / 400) % 2 === 0

      if (visible) {
        ctx.globalAlpha = opacity

        // Signal glow
        const glowSize = isWeird ? 20 : 12
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowSize)
        glow.addColorStop(0, color + "40")
        glow.addColorStop(1, color + "00")
        ctx.fillStyle = glow
        ctx.fillRect(sx - glowSize, sy - glowSize, glowSize * 2, glowSize * 2)

        // Signal dot
        const dotSize = isWeird ? 5 : isSelected ? 4 : 3
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(sx, sy, dotSize, 0, Math.PI * 2)
        ctx.fill()

        // Selection ring + crosshair
        if (isSelected) {
          ctx.strokeStyle = "#ffffff"
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(sx, sy, dotSize + 4, 0, Math.PI * 2)
          ctx.stroke()

          ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(sx - 12, sy)
          ctx.lineTo(sx - dotSize - 5, sy)
          ctx.moveTo(sx + dotSize + 5, sy)
          ctx.lineTo(sx + 12, sy)
          ctx.moveTo(sx, sy - 12)
          ctx.lineTo(sx, sy - dotSize - 5)
          ctx.moveTo(sx, sy + dotSize + 5)
          ctx.lineTo(sx, sy + 12)
          ctx.stroke()
        }

        // Frequency label
        const freqMhz = (sig.freq_hz / 1e6).toFixed(1)
        ctx.font = "9px monospace"
        ctx.textAlign = "left"
        ctx.fillStyle = color
        ctx.fillText(`${freqMhz}`, sx + dotSize + 5, sy - 2)

        if (sig.protocol && sig.protocol !== "unknown") {
          ctx.fillStyle = "rgba(34, 197, 94, 0.4)"
          ctx.font = "7px monospace"
          ctx.fillText(sig.protocol, sx + dotSize + 5, sy + 8)
        }

        ctx.globalAlpha = 1
      }
    }

    // Center station
    ctx.fillStyle = "#22c55e"
    ctx.beginPath()
    ctx.arc(cx, cy, 4, 0, Math.PI * 2)
    ctx.fill()

    const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 15)
    centerGlow.addColorStop(0, "rgba(34, 197, 94, 0.3)")
    centerGlow.addColorStop(1, "rgba(34, 197, 94, 0)")
    ctx.fillStyle = centerGlow
    ctx.fillRect(cx - 15, cy - 15, 30, 30)

    // HUD labels
    ctx.fillStyle = "rgba(34, 197, 94, 0.5)"
    ctx.font = "10px monospace"
    ctx.textAlign = "right"
    ctx.fillText(`ALT ${rangeKm} km`, cx + maxR - 5, cy - maxR + 15)

    ctx.textAlign = "left"
    ctx.fillText(`RNG ${rangeKm} km`, cx - maxR + 5, cy + maxR - 8)

    ctx.fillStyle = "rgba(34, 197, 94, 0.3)"
    ctx.font = "8px monospace"
    ctx.textAlign = "center"
    ctx.fillText(stationName, cx, cy + 14)

    // Outer boundary
    ctx.strokeStyle = "rgba(34, 197, 94, 0.25)"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2)
    ctx.stroke()

    // CRT scanlines
    ctx.globalAlpha = 0.03
    ctx.fillStyle = "#000000"
    for (let y = 0; y < h; y += 3) {
      ctx.fillRect(0, y, w, 1)
    }
    ctx.globalAlpha = 1

    // Advance sweep
    sweepAngleRef.current = (sweep + SWEEP_SPEED) % (Math.PI * 2)
    animRef.current = requestAnimationFrame(draw)
  }, [signals, selectedId, rangeKm, stationName])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const resize = () => {
      const rect = container.getBoundingClientRect()
      const size = Math.min(rect.width, rect.height) - 8
      const clamped = Math.max(300, Math.min(size, 900))
      canvas.width = clamped
      canvas.height = clamped
    }
    resize()
    window.addEventListener("resize", resize)

    animRef.current = requestAnimationFrame(draw)

    return () => {
      window.removeEventListener("resize", resize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [draw])

  const handleClick = (e) => {
    if (!onSelect) return
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const maxR = Math.min(cx, cy) - 50

    let closest = null
    let closestDist = 25

    for (const sig of signals) {
      const angle = signalAngle(sig)
      const r = signalRadius(sig, maxR, rangeKm)
      const sx = cx + r * Math.cos(angle)
      const sy = cy + r * Math.sin(angle)
      const d = Math.sqrt((x - sx) ** 2 + (y - sy) ** 2)
      if (d < closestDist) {
        closestDist = d
        closest = sig
      }
    }

    onSelect(closest?.id || null)
  }

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="cursor-crosshair"
        style={{ imageRendering: "auto" }}
      />
    </div>
  )
}
