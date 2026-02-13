import { useRef, useEffect, useCallback } from "react";
import { getSignalColor } from "../utils/colorMapper";

const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const SWEEP_SPEED = 0.02; // radians per frame
const TRAIL_LENGTH = 0.6; // radians of fade trail
const RING_KM = [20, 40, 60];

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return hash;
}

function signalAngle(signal) {
  // Deterministic angle based on signal id + freq
  const seed = hashCode(`${signal.id}-${Math.round(signal.freq_hz / 1000)}`);
  return ((seed % 3600) / 3600) * Math.PI * 2;
}

function signalRadius(signal, maxRadius, rangeKm) {
  const dist = signal.estimated_distance_km || 1;
  return Math.min((dist / rangeKm) * maxRadius, maxRadius * 0.95);
}

export default function RadarScreen({
  signals = [],
  selectedId,
  onSelect,
  rangeKm = 60,
}) {
  const canvasRef = useRef(null);
  const sweepAngleRef = useRef(0);
  const animRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(cx, cy) - 30;

    // Clear
    ctx.fillStyle = "#0a0f0a";
    ctx.fillRect(0, 0, w, h);

    // Range rings
    ctx.strokeStyle = "#1a3a1a";
    ctx.lineWidth = 1;
    for (const km of RING_KM) {
      const r = (km / rangeKm) * maxR;
      if (r > maxR) continue;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#2a4a2a";
      ctx.font = "10px monospace";
      ctx.fillText(`${km}km`, cx + r + 3, cy - 3);
    }

    // Cross lines
    ctx.strokeStyle = "#1a3a1a";
    ctx.beginPath();
    ctx.moveTo(cx, cy - maxR);
    ctx.lineTo(cx, cy + maxR);
    ctx.moveTo(cx - maxR, cy);
    ctx.lineTo(cx + maxR, cy);
    ctx.stroke();

    // Direction labels
    ctx.fillStyle = "#3a6a3a";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < DIRECTIONS.length; i++) {
      const angle = (i * Math.PI) / 4 - Math.PI / 2;
      const lx = cx + (maxR + 16) * Math.cos(angle);
      const ly = cy + (maxR + 16) * Math.sin(angle);
      ctx.fillText(DIRECTIONS[i], lx, ly);
    }

    // Sweep line with fade trail
    const sweep = sweepAngleRef.current;
    for (let i = 0; i < 30; i++) {
      const a = sweep - (i / 30) * TRAIL_LENGTH;
      const opacity = ((30 - i) / 30) * 0.5;
      ctx.strokeStyle = `rgba(34, 197, 94, ${opacity})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + maxR * Math.cos(a), cy + maxR * Math.sin(a));
      ctx.stroke();
    }

    // Draw signals
    for (const sig of signals) {
      const angle = signalAngle(sig);
      const r = signalRadius(sig, maxR, rangeKm);
      const sx = cx + r * Math.cos(angle);
      const sy = cy + r * Math.sin(angle);

      const ttlRatio =
        sig.max_ttl > 0 ? (sig.ttl ?? sig.max_ttl) / sig.max_ttl : 1;
      const opacity = Math.max(0.15, ttlRatio);
      const color = getSignalColor(sig.category);
      const isWeird = (sig.weirdness_score || 0) >= 40;
      const isSelected = sig.id === selectedId;

      // Blink effect for high weirdness
      const visible = !isWeird || Math.floor(Date.now() / 400) % 2 === 0;

      if (visible) {
        const dotSize = isWeird ? 6 : isSelected ? 5 : 3;

        ctx.globalAlpha = opacity;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, dotSize, 0, Math.PI * 2);
        ctx.fill();

        if (isSelected) {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx, sy, dotSize + 3, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Protocol label
        ctx.fillStyle = color;
        ctx.font = "9px monospace";
        ctx.textAlign = "left";
        ctx.fillText(sig.protocol || "", sx + dotSize + 3, sy + 3);

        ctx.globalAlpha = 1;
      }
    }

    // Center dot
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    // Advance sweep
    sweepAngleRef.current = (sweep + SWEEP_SPEED) % (Math.PI * 2);
    animRef.current = requestAnimationFrame(draw);
  }, [signals, selectedId, rangeKm]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      const size = Math.min(rect.width, 500);
      canvas.width = size;
      canvas.height = size;
    };
    resize();
    window.addEventListener("resize", resize);

    animRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw]);

  const handleClick = (e) => {
    if (!onSelect) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const maxR = Math.min(cx, cy) - 30;

    let closest = null;
    let closestDist = 20; // max click distance in pixels

    for (const sig of signals) {
      const angle = signalAngle(sig);
      const r = signalRadius(sig, maxR, rangeKm);
      const sx = cx + r * Math.cos(angle);
      const sy = cy + r * Math.sin(angle);
      const d = Math.sqrt((x - sx) ** 2 + (y - sy) ** 2);
      if (d < closestDist) {
        closestDist = d;
        closest = sig;
      }
    }

    onSelect(closest?.id || null);
  };

  return (
    <div className="flex justify-center">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="cursor-crosshair"
      />
    </div>
  );
}
