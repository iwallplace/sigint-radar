import { useState } from "react"
import RecordControl from "./RecordControl"

const CAT_ICONS = {
  aviation: "\u2708",
  aircraft: "\u2708",
  satellite: "\uD83D\uDEF0",
  weather_station: "\uD83C\uDF21",
  ism_sensor: "\uD83D\uDCE1",
  pager: "\uD83D\uDCDF",
  fm_broadcast: "\uD83D\uDCFB",
  marine: "\u2693",
  radio: "\uD83D\uDCF6",
}

const UNDECODED_RANGES = [
  [88, 108, "FM yayın sinyali — analog ses, RDS decode edilebilir ama kayıt gerekli"],
  [118, 136, "Havacılık telsizi (VHF-AM) — analog ses, decode edilemez, sadece IQ kaydı"],
  [136, 174, "VHF amatör/ticari telsiz — analog ses, dijital decode edilemez"],
  [380, 400, "TETRA dijital telsiz — şifreli, decode edilemez"],
  [400, 406, "Meteoroloji sonde frekansı — radiosonde decode için kayıt gerekli"],
  [406, 420, "ISM/telsiz bandı — protokol tanınamadı"],
  [430, 440, "UHF amatör bandı — karışık modülasyon"],
  [460, 470, "PMR446 telsiz — analog ses, decode edilemez"],
  [862, 875, "ISM 868 MHz — sensör verisi olabilir, kayıt + rtl_433 ile denenebilir"],
  [890, 960, "GSM hücresel — şifreli, decode edilemez"],
  [1090, 1091, "ADS-B havacılık — readsb ile decode edilir, otomatik taranır"],
  [1575, 1576, "GPS L1 — navigasyon sinyali, decode edilemez"],
]

function getUndecodedExplanation(freqHz) {
  if (!freqHz) return "Sinyal türü tanınamadı — decode edilemez, sadece IQ kaydı yapılabilir"
  const mhz = freqHz / 1e6
  for (const [lo, hi, msg] of UNDECODED_RANGES) {
    if (mhz >= lo && mhz <= hi) return msg
  }
  return "Bu sinyal türü analog/şifreli — decode edilemez, sadece IQ kaydı yapılabilir"
}

function PowerSparkline({ history }) {
  if (!history || history.length < 2) return null

  const w = 180
  const h = 30
  const pad = 2
  const values = history.map((p) => p.db)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return `${x},${y}`
  }).join(" ")

  return (
    <svg width={w} height={h} className="bg-[#060a06] rounded">
      <polyline
        points={points}
        fill="none"
        stroke="#22c55e"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function SignalDetail({
  signal,
  recording,
  recordProgress,
  recordResult,
  onRecordStart,
  onRecordStop,
  onClearRecord,
  onClose,
}) {
  const [durationMin, setDurationMin] = useState(1)

  if (!signal) return null

  const freqMhz = (signal.freq_hz / 1e6).toFixed(3)
  const icon = CAT_ICONS[signal.category] || "\u25CF"

  return (
    <div className="w-72 bg-[#0b100b]/95 border border-green-900/50 rounded-lg shadow-2xl shadow-black/50 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-green-900/30">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span className="text-sm font-bold text-green-400 font-mono">{freqMhz} MHz</span>
        </div>
        <button
          onClick={onClose}
          className="text-green-800 hover:text-green-400 text-xs px-1 font-bold"
        >
          [X]
        </button>
      </div>

      {/* Signal info */}
      <div className="px-3 py-2 space-y-1 text-[11px] border-b border-green-900/30">
        <Row label="BAND" value={signal.band_name} />
        {signal.band_description && (
          <Row label="DESC" value={signal.band_description} valueClass="text-green-700" />
        )}
        <Row label="PROTOCOL" value={signal.protocol} valueClass="text-green-300" />
        <Row label="CATEGORY" value={signal.category} />
        <Row label="POWER" value={`${signal.power_db?.toFixed(1)} dB`} />
        <Row label="SNR" value={`${signal.snr_db?.toFixed(1)} dB`} />
        <Row label="DISTANCE" value={`${signal.estimated_distance_km?.toFixed(1)} km`} />
        <Row label="WEIRDNESS" value={signal.weirdness_score} valueClass={
          (signal.weirdness_score || 0) >= 50 ? "text-red-400" : "text-green-500"
        } />
        {signal.decode_summary && (
          <Row label="DECODE" value={signal.decode_summary} valueClass="text-green-300" />
        )}
      </div>

      {/* Decoded data details */}
      {signal.decode_data && (
        <div className="px-3 py-2 border-b border-green-900/30">
          <div className="text-[9px] text-green-800 uppercase tracking-wider font-bold mb-1">
            Decoded Data
          </div>
          <div className="space-y-0.5 text-[10px] font-mono">
            {Object.entries(signal.decode_data).filter(([k]) => !["time", "mic"].includes(k)).slice(0, 12).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <span className="text-green-800 shrink-0">{k}</span>
                <span className="text-cyan-400 text-right truncate">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Undecoded signal explanation */}
      {!signal.decode_data && !signal.decode_summary && signal.protocol === "unknown" && (
        <div className="px-3 py-2 border-b border-green-900/30">
          <div className="text-[10px] text-yellow-600/90 leading-snug">
            {getUndecodedExplanation(signal.freq_hz)}
          </div>
        </div>
      )}

      {/* Power history */}
      {signal.power_history && signal.power_history.length > 1 && (
        <div className="px-3 py-2 border-b border-green-900/30">
          <div className="text-[9px] text-green-800 uppercase tracking-wider font-bold mb-1">
            Power History
          </div>
          <PowerSparkline history={signal.power_history} />
        </div>
      )}

      {/* Record section */}
      <div className="px-3 py-2 space-y-2">
        <div className="text-[9px] text-green-800 uppercase tracking-wider font-bold">
          IQ Record
        </div>

        {!recording && !recordResult && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-green-700">Duration:</label>
              <input
                type="number"
                min={1}
                max={300}
                value={durationMin}
                onChange={(e) => setDurationMin(Math.max(1, Math.min(300, Number(e.target.value))))}
                className="w-14 bg-[#060a06] border border-green-900/50 rounded px-1 py-0.5 text-[10px] text-green-400 text-center font-mono"
              />
              <span className="text-[9px] text-green-800">min</span>
            </div>
            <button
              onClick={() => onRecordStart(signal, durationMin * 60)}
              className="w-full py-1 bg-red-950/60 text-red-400 rounded border border-red-900/50 hover:bg-red-950 text-[10px] font-bold tracking-wider"
            >
              REC START
            </button>
          </div>
        )}

        <RecordControl
          recording={recording}
          progress={recordProgress}
          recordResult={recordResult}
          onStop={onRecordStop}
          onDismiss={onClearRecord}
        />
      </div>
    </div>
  )
}

function Row({ label, value, valueClass = "text-green-500" }) {
  return (
    <div className="flex justify-between">
      <span className="text-green-800">{label}</span>
      <span className={`font-mono ${valueClass}`}>{value ?? "\u2014"}</span>
    </div>
  )
}
