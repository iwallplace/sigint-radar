import { getCategoryStyle } from "../utils/colorMapper"

function getPriority(weirdness) {
  if (weirdness >= 70) return { label: "CRITICAL", bg: "bg-red-950", text: "text-red-400", border: "border-red-800" }
  if (weirdness >= 50) return { label: "HIGH", bg: "bg-orange-950", text: "text-orange-400", border: "border-orange-800" }
  if (weirdness >= 30) return { label: "MEDIUM", bg: "bg-yellow-950", text: "text-yellow-400", border: "border-yellow-800" }
  return { label: "LOW", bg: "bg-green-950", text: "text-green-600", border: "border-green-900" }
}

const CAT_ICONS = {
  aircraft: "\u2708",
  satellite: "\uD83D\uDEF0",
  weather_station: "\uD83C\uDF21",
  ism_sensor: "\uD83D\uDCE1",
  pager: "\uD83D\uDCDF",
  fm_broadcast: "\uD83D\uDCFB",
  marine: "\u2693",
  radio: "\uD83D\uDCF6",
  tetra: "\uD83D\uDD12",
  unknown: "\u25CF",
}

export default function SignalPanel({ signals = [], selectedId, onSelect }) {
  if (signals.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-green-800 text-xs">
        No signals detected
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {signals.map((sig) => {
        const cat = getCategoryStyle(sig.category)
        const priority = getPriority(sig.weirdness_score || 0)
        const isSelected = sig.id === selectedId
        const freqMhz = (sig.freq_hz / 1e6).toFixed(3)
        const icon = CAT_ICONS[sig.category] || CAT_ICONS.unknown
        const ttlRatio = sig.max_ttl > 0 ? (sig.ttl ?? sig.max_ttl) / sig.max_ttl : 1

        return (
          <div
            key={sig.id}
            onClick={() => onSelect?.(sig.id)}
            className={`px-3 py-2 cursor-pointer transition-all border-b border-green-900/20 ${
              isSelected
                ? "bg-green-950/60 border-l-2 border-l-green-400"
                : "hover:bg-green-950/30 border-l-2 border-l-transparent"
            }`}
            style={{ opacity: Math.max(0.4, ttlRatio) }}
          >
            {/* Row 1: Icon + Frequency + Priority badge */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm" style={{ color: cat.color }}>
                  {icon}
                </span>
                <span className="font-mono text-sm font-bold" style={{ color: cat.color }}>
                  {freqMhz} MHz
                </span>
                <span className="text-[10px] text-green-700">
                  {sig.protocol || "unknown"}
                </span>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider ${priority.bg} ${priority.text} border ${priority.border}`}>
                {priority.label}
              </span>
            </div>

            {/* Row 2: Stats */}
            <div className="flex items-center gap-3 mt-1 text-[10px] text-green-700 font-mono">
              <span>
                PWR <span className="text-green-500">{sig.power_db?.toFixed(1)}</span> dB
              </span>
              <span>
                SNR <span className="text-green-500">{sig.snr_db?.toFixed(1)}</span>
              </span>
              <span>
                DST <span className="text-green-500">{sig.estimated_distance_km?.toFixed(1)}</span> km
              </span>
              {(sig.weirdness_score || 0) > 0 && (
                <span>
                  WRD <span className={`font-bold ${sig.weirdness_score >= 50 ? "text-red-400" : sig.weirdness_score >= 30 ? "text-yellow-400" : "text-green-500"}`}>
                    {sig.weirdness_score}
                  </span>
                </span>
              )}
            </div>

            {/* Row 3: Decoded data (temp, humidity, address, model) */}
            {sig.decode_data && (
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-cyan-600 font-mono">
                {sig.decode_data.model && (
                  <span className="text-cyan-400">{sig.decode_data.model}</span>
                )}
                {sig.decode_data.temperature_C !== undefined && (
                  <span>T:{sig.decode_data.temperature_C}&deg;C</span>
                )}
                {sig.decode_data.humidity !== undefined && (
                  <span>H:{sig.decode_data.humidity}%</span>
                )}
                {sig.decode_data.address && (
                  <span>Addr:{sig.decode_data.address}</span>
                )}
                {sig.decode_data.wind_avg_km_h !== undefined && (
                  <span>W:{sig.decode_data.wind_avg_km_h}km/h</span>
                )}
              </div>
            )}

            {/* Row 4: Decode summary + Band desc */}
            <div className="flex items-center justify-between mt-0.5 text-[10px]">
              <span className="text-green-600 truncate flex-1">
                {sig.decode_summary || sig.band_description || sig.band_name || ""}
              </span>
              {sig.count > 1 && (
                <span className="text-green-800 ml-2">x{sig.count}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
