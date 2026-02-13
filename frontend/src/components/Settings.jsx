import { useState, useEffect } from "react"
import { useI18n } from "../i18n"

const REGION_OPTIONS = [
  { value: "eu", label: "Europe (EU)" },
  { value: "us", label: "Americas (US/CA)" },
  { value: "tr", label: "Turkey (TR)" },
  { value: "jp", label: "Japan (JP)" },
  { value: "au", label: "Australia (AU/NZ)" },
]

const FFT_OPTIONS = [1024, 2048, 4096]

export default function Settings({ config, sendMessage, onBack }) {
  const { t, lang, setLang } = useI18n()

  // Local state mirrors server config for instant preview
  const [rtlsdr, setRtlsdr] = useState({
    gain: 40,
    ppm_correction: 0,
    bias_tee: false,
    sample_rate: 2400000,
  })
  const [scanner, setScanner] = useState({
    signal_threshold_db: 10,
    cycle_delay_ms: 500,
    fft_size: 2048,
  })
  const [ui, setUi] = useState({
    theme: "dark",
    language: "en",
    radar_range_km: 200,
  })
  const [alerts, setAlerts] = useState({
    weirdness_threshold: 40,
    sound: true,
    desktop_notification: true,
  })
  const [recording, setRecording] = useState({
    max_duration_seconds: 60,
    max_disk_usage_gb: 10,
    auto_decode: true,
    keep_raw_after_decode: true,
  })
  const [station, setStation] = useState({
    lat: 0.0,
    lon: 0.0,
    name: "",
  })
  const [region, setRegion] = useState({ profile: "auto" })
  const [saved, setSaved] = useState(false)

  // Sync from server config
  useEffect(() => {
    if (!config) return
    if (config.rtlsdr) setRtlsdr((s) => ({ ...s, ...config.rtlsdr }))
    if (config.scanner) setScanner((s) => ({ ...s, ...config.scanner }))
    if (config.ui) setUi((s) => ({ ...s, ...config.ui }))
    if (config.alerts) setAlerts((s) => ({ ...s, ...config.alerts }))
    if (config.recording) setRecording((s) => ({ ...s, ...config.recording }))
    if (config.station) setStation((s) => ({ ...s, ...config.station }))
    if (config.region) setRegion((s) => ({ ...s, ...config.region }))
  }, [config])

  const handleSave = () => {
    sendMessage("update_config", { section: "rtlsdr", values: rtlsdr })
    sendMessage("update_config", { section: "scanner", values: scanner })
    sendMessage("update_config", { section: "ui", values: ui })
    sendMessage("update_config", { section: "alerts", values: alerts })
    sendMessage("update_config", { section: "recording", values: recording })
    sendMessage("update_config", { section: "station", values: station })
    sendMessage("update_config", { section: "region", values: region })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleDetectIP = async () => {
    try {
      const res = await fetch("https://ipinfo.io/json")
      const data = await res.json()
      if (data.loc) {
        const [lat, lon] = data.loc.split(",").map(Number)
        setStation((s) => ({ ...s, lat, lon }))
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-widest text-green-400">
            {t("settings.title")}
          </h2>
          <button
            onClick={onBack}
            className="text-xs text-gray-500 hover:text-gray-300 px-3 py-1 border border-gray-700 rounded"
          >
            {t("settings.back")}
          </button>
        </div>

        {/* RTL-SDR */}
        <Section title={t("settings.section_rtlsdr")}>
          <SliderRow
            label={t("settings.gain")}
            value={rtlsdr.gain}
            min={0} max={50} step={1}
            preview={`${rtlsdr.gain} dB`}
            onChange={(v) => setRtlsdr((s) => ({ ...s, gain: v }))}
          />
          <InputRow
            label={t("settings.ppm")}
            type="number"
            value={rtlsdr.ppm_correction}
            onChange={(v) => setRtlsdr((s) => ({ ...s, ppm_correction: Number(v) }))}
          />
          <ToggleRow
            label={t("settings.bias_tee")}
            value={rtlsdr.bias_tee}
            onChange={(v) => setRtlsdr((s) => ({ ...s, bias_tee: v }))}
          />
          <InfoRow
            label={t("settings.sample_rate")}
            value={`${(rtlsdr.sample_rate / 1e6).toFixed(1)} MHz`}
          />
        </Section>

        {/* Scanner */}
        <Section title={t("settings.section_scanner")}>
          <SliderRow
            label={t("settings.threshold")}
            value={scanner.signal_threshold_db}
            min={5} max={30} step={1}
            preview={`${scanner.signal_threshold_db} dB`}
            onChange={(v) => setScanner((s) => ({ ...s, signal_threshold_db: v }))}
          />
          <InputRow
            label={t("settings.cycle_delay")}
            type="number"
            value={scanner.cycle_delay_ms}
            suffix="ms"
            onChange={(v) => setScanner((s) => ({ ...s, cycle_delay_ms: Math.max(100, Number(v)) }))}
          />
          <SelectRow
            label={t("settings.fft_size")}
            value={scanner.fft_size}
            options={FFT_OPTIONS.map((v) => ({ value: v, label: String(v) }))}
            onChange={(v) => setScanner((s) => ({ ...s, fft_size: Number(v) }))}
          />
        </Section>

        {/* Radar */}
        <Section title={t("settings.section_radar")}>
          <SliderRow
            label={t("settings.radar_range")}
            value={ui.radar_range_km}
            min={10} max={500} step={10}
            preview={`${ui.radar_range_km} km`}
            onChange={(v) => setUi((s) => ({ ...s, radar_range_km: v }))}
          />
        </Section>

        {/* Alerts */}
        <Section title={t("settings.section_alerts")}>
          <SliderRow
            label={t("settings.weirdness_threshold")}
            value={alerts.weirdness_threshold}
            min={0} max={100} step={5}
            preview={`${alerts.weirdness_threshold}`}
            onChange={(v) => setAlerts((s) => ({ ...s, weirdness_threshold: v }))}
          />
          <ToggleRow
            label={t("settings.sound")}
            value={alerts.sound}
            onChange={(v) => setAlerts((s) => ({ ...s, sound: v }))}
          />
          <ToggleRow
            label={t("settings.desktop_notification")}
            value={alerts.desktop_notification}
            onChange={(v) => setAlerts((s) => ({ ...s, desktop_notification: v }))}
          />
        </Section>

        {/* Recording */}
        <Section title={t("settings.section_recording")}>
          <InputRow
            label={t("settings.max_duration")}
            type="number"
            value={recording.max_duration_seconds}
            suffix={t("settings.seconds")}
            onChange={(v) => setRecording((s) => ({ ...s, max_duration_seconds: Math.max(1, Number(v)) }))}
          />
          <InputRow
            label={t("settings.max_disk")}
            type="number"
            value={recording.max_disk_usage_gb}
            suffix="GB"
            onChange={(v) => setRecording((s) => ({ ...s, max_disk_usage_gb: Math.max(1, Number(v)) }))}
          />
          <ToggleRow
            label={t("settings.auto_decode")}
            value={recording.auto_decode}
            onChange={(v) => setRecording((s) => ({ ...s, auto_decode: v }))}
          />
          <ToggleRow
            label={t("settings.keep_raw")}
            value={recording.keep_raw_after_decode}
            onChange={(v) => setRecording((s) => ({ ...s, keep_raw_after_decode: v }))}
          />
        </Section>

        {/* Station */}
        <Section title={t("settings.section_station")}>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <InputRow
                label={t("setup.latitude")}
                type="number"
                value={station.lat}
                onChange={(v) => setStation((s) => ({ ...s, lat: Number(v) }))}
              />
            </div>
            <div className="flex-1">
              <InputRow
                label={t("setup.longitude")}
                type="number"
                value={station.lon}
                onChange={(v) => setStation((s) => ({ ...s, lon: Number(v) }))}
              />
            </div>
            <button
              onClick={handleDetectIP}
              className="text-xs text-cyan-400 hover:text-cyan-300 px-2 py-1 border border-gray-700 rounded mb-0.5"
            >
              {t("settings.detect_ip")}
            </button>
          </div>
          <InputRow
            label={t("setup.station_name")}
            type="text"
            value={station.name}
            onChange={(v) => setStation((s) => ({ ...s, name: v }))}
          />
          <SelectRow
            label={t("settings.region")}
            value={region.profile}
            options={REGION_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
            onChange={(v) => setRegion((s) => ({ ...s, profile: v }))}
          />
        </Section>

        {/* Interface */}
        <Section title={t("settings.section_interface")}>
          <SelectRow
            label={t("settings.theme")}
            value={ui.theme}
            options={[
              { value: "dark", label: t("settings.dark") },
              { value: "light", label: t("settings.light") },
            ]}
            onChange={(v) => setUi((s) => ({ ...s, theme: v }))}
          />
          <SelectRow
            label={t("settings.language")}
            value={ui.language}
            options={[
              { value: "en", label: "English" },
              { value: "tr", label: "Turkce" },
            ]}
            onChange={(v) => {
              setUi((s) => ({ ...s, language: v }))
              setLang(v)
            }}
          />
        </Section>

        {/* Save bar */}
        <div className="flex items-center gap-3 py-4 border-t border-gray-800">
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-green-900/60 text-green-400 rounded hover:bg-green-900 text-sm font-bold tracking-wide"
          >
            {t("settings.save")}
          </button>
          {saved && (
            <span className="text-green-400 text-xs animate-pulse">
              {t("settings.saved")}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="border border-gray-800 rounded p-4 space-y-3">
      <h3 className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
        {title}
      </h3>
      {children}
    </div>
  )
}

function SliderRow({ label, value, min, max, step, preview, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 w-32 shrink-0">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-green-500 h-1.5"
      />
      <span className="text-xs text-green-400 w-16 text-right font-mono">{preview}</span>
    </div>
  )
}

function InputRow({ label, type, value, suffix, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 w-32 shrink-0">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-green-400"
      />
      {suffix && <span className="text-[10px] text-gray-600 w-8">{suffix}</span>}
    </div>
  )
}

function ToggleRow({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 w-32 shrink-0">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`w-10 h-5 rounded-full transition-colors relative ${
          value ? "bg-green-700" : "bg-gray-700"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            value ? "left-5" : "left-0.5"
          }`}
        />
      </button>
    </div>
  )
}

function SelectRow({ label, value, options, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 w-32 shrink-0">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-green-400"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 w-32 shrink-0">{label}</span>
      <span className="text-xs text-gray-500">{value}</span>
    </div>
  )
}
