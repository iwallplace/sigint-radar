import { useRef, useEffect, useCallback } from "react"
import { getSignalColor } from "../utils/colorMapper"

/* ───────── constants ───────── */
const SWEEP_SPEED = 0.012
const TRAIL_STEPS = 50
const TRAIL_ARC = 0.6 // radians of fade trail behind sweep

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]

/* ───────── helpers ───────── */
function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0
  return hash
}

function signalAngle(signal) {
  const seed = hashCode(`${signal.id}-${Math.round(signal.freq_hz / 1000)}`)
  return ((seed % 3600) / 3600) * Math.PI * 2
}

function signalNormDist(signal, rangeKm) {
  const dist = signal.estimated_distance_km || 1
  return Math.min(dist / rangeKm, 0.92)
}

function getSignalAltKm(signal) {
  if (signal.category === "aircraft" && signal.decode_data?.altitude_baro_ft) {
    return signal.decode_data.altitude_baro_ft * 0.0003048
  }
  if (signal.category === "aircraft") return 8 + Math.abs(hashCode(signal.id || "")) % 5
  if (signal.category === "satellite") return 20 + Math.abs(hashCode(signal.id || "")) % 10
  return 0
}

/* ───────── perspective projection ───────── */
// We fake a 3D perspective PPI by tilting the radar plane ~30° forward
// Ground plane: (gx, gz) → screen.  Altitude lifts signal upward.
function project(gx, gz, altY, cx, cy, maxR, tilt) {
  // tilt: 0 = top-down, 1 = edge-on.  We use ~0.55 for nice perspective
  const cosT = Math.cos(tilt)
  const sinT = Math.sin(tilt)

  // After tilt, the y-screen contribution from gz (depth)
  const screenX = cx + gx * maxR
  const screenY = cy + gz * maxR * cosT - altY * maxR * sinT

  // Depth for fading (further = smaller factor)
  const depth = 1 - gz * 0.15 // subtle depth fade
  return { x: screenX, y: screenY, depth }
}

/* ───────── component ───────── */
export default function Radar3D({
  signals = [],
  selectedId,
  onSelect,
  rangeKm = 60,
  stationName = "SIGINT-01",
}) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const sweepRef = useRef(0)
  const animRef = useRef(null)

  const TILT = 1.05 // ~60° from horizontal → nice perspective angle

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    const w = canvas.width
    const h = canvas.height
    const cx = w / 2
    const cy = h * 0.48 // slightly above center for perspective
    const maxR = Math.min(w, h) * 0.38

    // Clear to black
    ctx.fillStyle = "#000000"
    ctx.fillRect(0, 0, w, h)

    const cosT = Math.cos(TILT)

    // ── Subtle ground glow ──
    const bgGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 1.2)
    bgGlow.addColorStop(0, "rgba(34, 197, 94, 0.04)")
    bgGlow.addColorStop(0.6, "rgba(34, 197, 94, 0.015)")
    bgGlow.addColorStop(1, "rgba(0, 0, 0, 0)")
    ctx.fillStyle = bgGlow
    ctx.fillRect(0, 0, w, h)

    // ── Range rings (ellipses due to perspective tilt) ──
    const ringCount = 4
    for (let i = 1; i <= ringCount; i++) {
      const ratio = i / ringCount
      const rX = ratio * maxR
      const rY = ratio * maxR * cosT

      ctx.strokeStyle = `rgba(34, 197, 94, ${0.08 + i * 0.03})`
      ctx.lineWidth = 0.8
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.ellipse(cx, cy, rX, rY, 0, 0, Math.PI * 2)
      ctx.stroke()

      // km label — right side of ring
      const km = Math.round(ratio * rangeKm)
      ctx.fillStyle = "rgba(34, 197, 94, 0.35)"
      ctx.font = `${Math.max(10, Math.round(maxR * 0.04))}px monospace`
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillText(`${km} km`, cx + rX + 6, cy)
    }

    // ── Cross lines (N-S, E-W) ──
    ctx.strokeStyle = "rgba(34, 197, 94, 0.10)"
    ctx.lineWidth = 0.5
    ctx.setLineDash([])
    // N-S line
    ctx.beginPath()
    ctx.moveTo(cx, cy - maxR * cosT)
    ctx.lineTo(cx, cy + maxR * cosT)
    ctx.stroke()
    // E-W line
    ctx.beginPath()
    ctx.moveTo(cx - maxR, cy)
    ctx.lineTo(cx + maxR, cy)
    ctx.stroke()

    // ── Diagonal lines ──
    ctx.strokeStyle = "rgba(34, 197, 94, 0.05)"
    ctx.setLineDash([3, 5])
    for (let a = 1; a < 8; a += 2) {
      const angle = (a / 8) * Math.PI * 2
      const ex = Math.sin(angle) * maxR
      const ey = -Math.cos(angle) * maxR * cosT
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + ex, cy + ey)
      ctx.stroke()
    }
    ctx.setLineDash([])

    // ── Compass labels ──
    const compassFontMain = `bold ${Math.max(13, Math.round(maxR * 0.055))}px monospace`
    const compassFontSec = `${Math.max(9, Math.round(maxR * 0.035))}px monospace`
    const compassFontTri = `${Math.max(7, Math.round(maxR * 0.028))}px monospace`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2
      const isMain = i % 4 === 0
      const isSec = i % 2 === 0
      const labelDist = 1.08

      const lx = cx + Math.sin(angle) * maxR * labelDist
      const ly = cy - Math.cos(angle) * maxR * cosT * labelDist

      if (isMain) {
        ctx.fillStyle = "rgba(34, 197, 94, 0.75)"
        ctx.font = compassFontMain
      } else if (isSec) {
        ctx.fillStyle = "rgba(34, 197, 94, 0.3)"
        ctx.font = compassFontSec
      } else {
        ctx.fillStyle = "rgba(34, 197, 94, 0.15)"
        ctx.font = compassFontTri
      }
      ctx.fillText(COMPASS[i], lx, ly)

      // tick mark on ring edge
      const t1 = isMain ? 0.96 : 0.98
      const t2 = 1.0
      ctx.strokeStyle = isMain ? "rgba(34, 197, 94, 0.4)" : "rgba(34, 197, 94, 0.12)"
      ctx.lineWidth = isMain ? 1.5 : 0.8
      ctx.beginPath()
      ctx.moveTo(cx + Math.sin(angle) * maxR * t1, cy - Math.cos(angle) * maxR * cosT * t1)
      ctx.lineTo(cx + Math.sin(angle) * maxR * t2, cy - Math.cos(angle) * maxR * cosT * t2)
      ctx.stroke()
    }

    // ── Sweep line with trail ──
    const sweep = sweepRef.current
    for (let i = 0; i < TRAIL_STEPS; i++) {
      const a = sweep - (i / TRAIL_STEPS) * TRAIL_ARC
      const opacity = ((TRAIL_STEPS - i) / TRAIL_STEPS) * 0.4
      const ex = Math.sin(a) * maxR
      const ey = -Math.cos(a) * maxR * cosT

      ctx.strokeStyle = `rgba(34, 197, 94, ${opacity})`
      ctx.lineWidth = i === 0 ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + ex, cy + ey)
      ctx.stroke()
    }

    // Sweep wedge fill (subtle)
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    const wedgeSteps = 30
    for (let i = 0; i <= wedgeSteps; i++) {
      const a = sweep - (i / wedgeSteps) * TRAIL_ARC
      const ex = Math.sin(a) * maxR
      const ey = -Math.cos(a) * maxR * cosT
      if (i === 0) ctx.moveTo(cx + ex, cy + ey)
      else ctx.lineTo(cx + ex, cy + ey)
    }
    ctx.lineTo(cx, cy)
    ctx.closePath()
    const wedgeGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR)
    wedgeGrad.addColorStop(0, "rgba(34, 197, 94, 0.06)")
    wedgeGrad.addColorStop(1, "rgba(34, 197, 94, 0.01)")
    ctx.fillStyle = wedgeGrad
    ctx.fill()

    // ── Height reference axis (vertical from center up) ──
    const altMaxKm = 30
    const altMaxPx = maxR * 0.8
    ctx.strokeStyle = "rgba(34, 197, 94, 0.08)"
    ctx.lineWidth = 0.5
    ctx.setLineDash([2, 4])
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx, cy - altMaxPx)
    ctx.stroke()
    ctx.setLineDash([])

    // ── Draw signals ──
    // Sort: ground first, then by altitude ascending (so high signals render on top)
    const sortedSignals = [...signals].sort((a, b) => getSignalAltKm(a) - getSignalAltKm(b))

    for (const sig of sortedSignals) {
      const angle = signalAngle(sig)
      const normDist = signalNormDist(sig, rangeKm)
      const altKm = getSignalAltKm(sig)

      // Ground position in normalized coords
      const gx = Math.sin(angle) * normDist
      const gz = -Math.cos(angle) * normDist

      // Altitude in normalized units (scaled to altMaxPx)
      const altNorm = Math.min(altKm / altMaxKm, 1.0) * (altMaxPx / maxR)

      const p = project(gx, gz, altNorm, cx, cy, maxR, TILT)

      const ttlRatio = sig.max_ttl > 0 ? (sig.ttl ?? sig.max_ttl) / sig.max_ttl : 1
      const opacity = Math.max(0.3, ttlRatio) * Math.max(0.7, p.depth)
      const color = getSignalColor(sig.category)
      const isWeird = (sig.weirdness_score || 0) >= 40
      const isSelected = sig.id === selectedId

      const visible = !isWeird || Math.floor(Date.now() / 400) % 2 === 0
      if (!visible) continue

      ctx.globalAlpha = opacity

      // Altitude line: from ground point up to signal point
      if (altKm > 0.5) {
        const pGround = project(gx, gz, 0, cx, cy, maxR, TILT)
        ctx.strokeStyle = `rgba(34, 197, 94, 0.15)`
        ctx.lineWidth = 0.5
        ctx.setLineDash([2, 3])
        ctx.beginPath()
        ctx.moveTo(pGround.x, pGround.y)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
        ctx.setLineDash([])

        // Ground shadow dot
        ctx.fillStyle = "rgba(34, 197, 94, 0.12)"
        ctx.beginPath()
        ctx.arc(pGround.x, pGround.y, 1.5, 0, Math.PI * 2)
        ctx.fill()
      }

      // Signal dot — small bright point, NOT a sphere
      const dotSize = isWeird ? 3.5 : isSelected ? 3 : 2
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(p.x, p.y, dotSize, 0, Math.PI * 2)
      ctx.fill()

      // Signal glow
      const glowSize = isWeird ? 14 : 8
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowSize)
      glow.addColorStop(0, color + "30")
      glow.addColorStop(1, color + "00")
      ctx.fillStyle = glow
      ctx.fillRect(p.x - glowSize, p.y - glowSize, glowSize * 2, glowSize * 2)

      // Selection ring + crosshair
      if (isSelected) {
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(p.x, p.y, dotSize + 4, 0, Math.PI * 2)
        ctx.stroke()

        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.moveTo(p.x - 10, p.y)
        ctx.lineTo(p.x - dotSize - 5, p.y)
        ctx.moveTo(p.x + dotSize + 5, p.y)
        ctx.lineTo(p.x + 10, p.y)
        ctx.moveTo(p.x, p.y - 10)
        ctx.lineTo(p.x, p.y - dotSize - 5)
        ctx.moveTo(p.x, p.y + dotSize + 5)
        ctx.lineTo(p.x, p.y + 10)
        ctx.stroke()
      }

      // Frequency label
      const freqMhz = (sig.freq_hz / 1e6).toFixed(3)
      const fontSize = Math.max(8, Math.round(maxR * 0.032))
      ctx.font = `${fontSize}px monospace`
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillStyle = color
      ctx.fillText(`${freqMhz} MHz`, p.x + dotSize + 5, p.y - 3)

      // Protocol / description
      if (sig.protocol && sig.protocol !== "unknown") {
        ctx.fillStyle = "rgba(34, 197, 94, 0.4)"
        ctx.font = `${Math.max(7, fontSize - 2)}px monospace`
        ctx.fillText(sig.protocol, p.x + dotSize + 5, p.y + fontSize - 1)
      }

      ctx.globalAlpha = 1
    }

    // ── Center station marker ──
    ctx.fillStyle = "#22c55e"
    ctx.beginPath()
    ctx.arc(cx, cy, 3, 0, Math.PI * 2)
    ctx.fill()
    // Station glow
    const stGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 12)
    stGlow.addColorStop(0, "rgba(34, 197, 94, 0.4)")
    stGlow.addColorStop(1, "rgba(34, 197, 94, 0)")
    ctx.fillStyle = stGlow
    ctx.fillRect(cx - 12, cy - 12, 24, 24)

    // Station name
    ctx.fillStyle = "rgba(34, 197, 94, 0.3)"
    ctx.font = `${Math.max(8, Math.round(maxR * 0.03))}px monospace`
    ctx.textAlign = "center"
    ctx.fillText(stationName, cx, cy + 12)

    // ── Outer boundary ellipse ──
    ctx.strokeStyle = "rgba(34, 197, 94, 0.2)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(cx, cy, maxR, maxR * cosT, 0, 0, Math.PI * 2)
    ctx.stroke()

    // ── HUD overlays ──
    const hudFont = `bold ${Math.max(11, Math.round(maxR * 0.042))}px monospace`

    // ALT indicator — bottom right
    ctx.fillStyle = "rgba(34, 197, 94, 0.5)"
    ctx.font = hudFont
    ctx.textAlign = "right"
    ctx.textBaseline = "bottom"
    ctx.fillText(`ALT ${altMaxKm} km`, w - 20, h - 20)

    // RNG indicator — bottom left
    ctx.textAlign = "left"
    ctx.fillText(`RNG ${rangeKm} km`, 20, h - 20)

    // Top left info
    ctx.fillStyle = "rgba(34, 197, 94, 0.3)"
    ctx.font = `${Math.max(9, Math.round(maxR * 0.032))}px monospace`
    ctx.textAlign = "left"
    ctx.textBaseline = "top"
    ctx.fillText(`SIGNALS: ${signals.length}`, 20, 16)
    ctx.fillText(`MODE: 3D PPI`, 20, 30)

    // ── CRT scanlines ──
    ctx.globalAlpha = 0.025
    ctx.fillStyle = "#000000"
    for (let y = 0; y < h; y += 3) {
      ctx.fillRect(0, y, w, 1)
    }
    ctx.globalAlpha = 1

    // ── Advance sweep ──
    sweepRef.current = (sweep + SWEEP_SPEED) % (Math.PI * 2)
    animRef.current = requestAnimationFrame(draw)
  }, [signals, selectedId, rangeKm, stationName, TILT])

  // ── Resize & animation ──
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const resize = () => {
      const rect = container.getBoundingClientRect()
      const size = Math.min(rect.width, rect.height) - 8
      const clamped = Math.max(400, Math.min(size, 1200))
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

  // ── Click detection ──
  const handleClick = useCallback((e) => {
    if (!onSelect) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const mx = (e.clientX - rect.left) * scaleX
    const my = (e.clientY - rect.top) * scaleY
    const w = canvas.width
    const h = canvas.height
    const cx = w / 2
    const cy = h * 0.48
    const maxR = Math.min(w, h) * 0.38
    const cosT = Math.cos(TILT)
    const altMaxKm = 30
    const altMaxPx = maxR * 0.8

    let closest = null
    let closestDist = 20

    for (const sig of signals) {
      const angle = signalAngle(sig)
      const normDist = signalNormDist(sig, rangeKm)
      const altKm = getSignalAltKm(sig)

      const gx = Math.sin(angle) * normDist
      const gz = -Math.cos(angle) * normDist
      const altNorm = Math.min(altKm / altMaxKm, 1.0) * (altMaxPx / maxR)
      const p = project(gx, gz, altNorm, cx, cy, maxR, TILT)

      const d = Math.sqrt((mx - p.x) ** 2 + (my - p.y) ** 2)
      if (d < closestDist) {
        closestDist = d
        closest = sig
      }
    }

    onSelect(closest?.id || null)
  }, [onSelect, signals, rangeKm, TILT])

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
