import { getCategoryStyle } from "../utils/colorMapper";

function WeirdnessBar({ score }) {
  const color =
    score >= 70
      ? "bg-red-500"
      : score >= 40
        ? "bg-yellow-500"
        : "bg-green-600";

  return (
    <div className="flex items-center gap-1">
      <div className="w-12 h-2 bg-gray-800 rounded overflow-hidden">
        <div
          className={`h-full ${color} rounded`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs w-6 text-right">{score}</span>
    </div>
  );
}

export default function SignalList({ signals = [], selectedId, onSelect }) {
  if (signals.length === 0) {
    return (
      <p className="text-gray-600 text-center py-4 text-sm">
        Waiting for signals...
      </p>
    );
  }

  return (
    <div className="border border-gray-800 rounded max-h-80 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="text-gray-500 border-b border-gray-800 sticky top-0 bg-gray-950">
          <tr>
            <th className="text-left px-2 py-1.5">Cat</th>
            <th className="text-left px-2 py-1.5">Freq (MHz)</th>
            <th className="text-left px-2 py-1.5">Protocol</th>
            <th className="text-right px-2 py-1.5">dB</th>
            <th className="text-right px-2 py-1.5">SNR</th>
            <th className="text-right px-2 py-1.5">Dist</th>
            <th className="text-right px-2 py-1.5">Weird</th>
            <th className="text-right px-2 py-1.5">#</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => {
            const cat = getCategoryStyle(s.category);
            const isSelected = s.id === selectedId;
            const ttlRatio =
              s.max_ttl > 0 ? (s.ttl ?? s.max_ttl) / s.max_ttl : 1;

            return (
              <tr
                key={s.id}
                onClick={() => onSelect?.(s.id)}
                className={`border-b border-gray-900 cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-gray-800 text-white"
                    : "hover:bg-gray-900"
                }`}
                style={{ opacity: Math.max(0.3, ttlRatio) }}
              >
                <td className="px-2 py-1" style={{ color: cat.color }}>
                  {cat.icon}
                </td>
                <td className="px-2 py-1 font-mono">
                  {(s.freq_hz / 1e6).toFixed(3)}
                </td>
                <td className="px-2 py-1">{s.protocol}</td>
                <td className="px-2 py-1 text-right font-mono">
                  {s.power_db?.toFixed(1)}
                </td>
                <td className="px-2 py-1 text-right font-mono">
                  {s.snr_db?.toFixed(1)}
                </td>
                <td className="px-2 py-1 text-right font-mono">
                  {s.estimated_distance_km?.toFixed(1)}
                </td>
                <td className="px-2 py-1 text-right">
                  <WeirdnessBar score={s.weirdness_score || 0} />
                </td>
                <td className="px-2 py-1 text-right text-gray-500">
                  {s.count || 1}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
