import { useState } from "react";
import RecordControl from "./RecordControl";

const CAT_ICONS = {
  aviation: "\u2708",
  aircraft: "\u2708",
  satellite: "\ud83d\udef0",
  weather_station: "\ud83c\udf21",
  ism_sensor: "\ud83d\udce1",
  pager: "\ud83d\udcdf",
  broadcast: "\ud83d\udcfb",
  marine: "\u2693",
  amateur: "\ud83d\udcf6",
};

export default function SignalDetail({
  signal,
  recording,
  recordProgress,
  recordResult,
  onRecordStart,
  onRecordStop,
  onClose,
}) {
  const [duration, setDuration] = useState(15);

  if (!signal) return null;

  const freqMhz = (signal.freq_hz / 1e6).toFixed(3);
  const icon = CAT_ICONS[signal.category] || "\u25cf";

  return (
    <div className="w-72 border-l border-gray-800 bg-gray-900/90 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-sm font-bold text-green-400">{freqMhz} MHz</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-600 hover:text-gray-400 text-sm px-1"
        >
          x
        </button>
      </div>

      {/* Signal info */}
      <div className="px-3 py-2 space-y-1.5 text-xs border-b border-gray-800">
        <Row label="Bant" value={signal.band_name} />
        <Row label="Protokol" value={signal.protocol} valueClass="text-cyan-400" />
        <Row label="Kategori" value={signal.category} />
        <Row label="Güç" value={`${signal.power_db?.toFixed(1)} dB`} />
        <Row label="SNR" value={`${signal.snr_db?.toFixed(1)} dB`} />
        <Row
          label="Mesafe"
          value={`${signal.estimated_distance_km?.toFixed(1)} km`}
        />
        <Row label="Weirdness" value={signal.weirdness_score} />
        {signal.decode_summary && (
          <Row label="Decode" value={signal.decode_summary} valueClass="text-green-300" />
        )}
      </div>

      {/* Record section */}
      <div className="px-3 py-3 space-y-3">
        <h4 className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
          Kayıt
        </h4>

        {!recording && !recordResult && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Süre:</label>
              <input
                type="number"
                min={1}
                max={60}
                value={duration}
                onChange={(e) => setDuration(Math.max(1, Math.min(60, Number(e.target.value))))}
                className="w-14 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-green-400 text-center"
              />
              <span className="text-[10px] text-gray-600">sn</span>
            </div>
            <button
              onClick={() => onRecordStart(signal, duration)}
              className="w-full py-1.5 bg-red-900/60 text-red-400 rounded hover:bg-red-900 text-xs font-bold tracking-wide"
            >
              KAYIT ET
            </button>
          </div>
        )}

        <RecordControl
          recording={recording}
          progress={recordProgress}
          recordResult={recordResult}
          onStop={onRecordStop}
        />
      </div>
    </div>
  );
}

function Row({ label, value, valueClass = "text-gray-300" }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={valueClass}>{value ?? "—"}</span>
    </div>
  );
}
