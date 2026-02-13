import { useState, useMemo } from "react";

const STATUS_STYLE = {
  idle: { color: "#6b7280", icon: "\u25CF" },       // gray
  scanning: { color: "#3b82f6", icon: "\u25CF" },    // blue
  found: { color: "#22c55e", icon: "\u25CF" },       // green
  empty: { color: "#eab308", icon: "\u25CF" },       // yellow
  error: { color: "#ef4444", icon: "\u25CF" },       // red
};

const QUICK_FILTERS = [
  { label: "All", filter: () => true },
  { label: "None", filter: () => false },
  { label: "Industrial", filter: (b) => ["ism_sensor", "unknown"].includes(b.category) },
  { label: "Aviation", filter: (b) => ["aircraft"].includes(b.category) },
  { label: "Amateur", filter: (b) => b.name.startsWith("amateur") },
];

export default function BandCatalog({
  bands = [],
  bandStatus = {},
  scanning = false,
  signalCount = 0,
  onScanStart,
  onScanStop,
}) {
  const [selected, setSelected] = useState(() => {
    const s = new Set();
    for (const b of bands) {
      if (b.enabled) s.add(b.name);
    }
    return s;
  });

  // Sync initial selection when bands arrive
  useMemo(() => {
    if (bands.length > 0 && selected.size === 0) {
      const s = new Set();
      for (const b of bands) {
        if (b.enabled) s.add(b.name);
      }
      setSelected(s);
    }
  }, [bands.length]);

  const toggle = (name) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const applyFilter = (filterFn) => {
    const next = new Set();
    for (const b of bands) {
      if (filterFn(b)) next.add(b.name);
    }
    setSelected(next);
  };

  const handleScan = () => {
    if (scanning) {
      onScanStop?.();
    } else {
      onScanStart?.([...selected]);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 border-r border-gray-800 w-64 min-w-[250px]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800">
        <h2 className="text-sm font-bold text-green-400 tracking-wider">
          BAND CATALOG
        </h2>
      </div>

      {/* Quick filters */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-gray-800">
        {QUICK_FILTERS.map((qf) => (
          <button
            key={qf.label}
            onClick={() => applyFilter(qf.filter)}
            className="px-2 py-0.5 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          >
            {qf.label}
          </button>
        ))}
      </div>

      {/* Band list */}
      <div className="flex-1 overflow-y-auto">
        {bands.map((band) => {
          const status = bandStatus[band.name] || "idle";
          const style = STATUS_STYLE[status] || STATUS_STYLE.idle;
          const isSelected = selected.has(band.name);
          const isScanning = status === "scanning";

          return (
            <label
              key={band.name}
              className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-900 transition-colors text-xs ${
                isScanning ? "bg-gray-900" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(band.name)}
                className="accent-green-500 w-3.5 h-3.5"
                disabled={scanning}
              />
              <span
                style={{ color: style.color }}
                className={isScanning ? "animate-pulse" : ""}
              >
                {style.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-gray-300 truncate">{band.description}</div>
                <div className="text-gray-600 text-[10px]">
                  {band.center_mhz?.toFixed(1)} MHz &middot; {band.priority}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {/* Scan controls */}
      <div className="px-3 py-2 border-t border-gray-800 space-y-2">
        <div className="flex gap-2 text-xs text-gray-500">
          <span>Selected: {selected.size}</span>
          <span>&middot;</span>
          <span>Signals: {signalCount}</span>
        </div>

        <button
          onClick={handleScan}
          disabled={!scanning && selected.size === 0}
          className={`w-full py-2 rounded text-sm font-bold transition-colors ${
            scanning
              ? "bg-red-900 hover:bg-red-800 text-red-300"
              : selected.size === 0
                ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                : "bg-green-900 hover:bg-green-800 text-green-300"
          }`}
        >
          {scanning ? "\u23F9 STOP" : "\u25B6 SCAN"}
        </button>
      </div>
    </div>
  );
}
