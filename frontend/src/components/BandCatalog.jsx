import { useState, useMemo } from "react"

const STATUS_COLORS = {
  idle: "#4b5563",
  scanning: "#3b82f6",
  found: "#22c55e",
  empty: "#eab308",
  error: "#ef4444",
}

export default function BandCatalog({
  bands = [],
  bandStatus = {},
  scanning = false,
  signalCount = 0,
  onScanStart,
  onScanStop,
}) {
  const [selected, setSelected] = useState(() => {
    const s = new Set()
    for (const b of bands) {
      if (b.enabled) s.add(b.name)
    }
    return s
  })

  useMemo(() => {
    if (bands.length > 0 && selected.size === 0) {
      const s = new Set()
      for (const b of bands) {
        if (b.enabled) s.add(b.name)
      }
      setSelected(s)
    }
  }, [bands.length])

  const toggle = (name) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const selectAll = () => {
    setSelected(new Set(bands.map((b) => b.name)))
  }

  const selectNone = () => {
    setSelected(new Set())
  }

  const handleScan = () => {
    if (scanning) {
      onScanStop?.()
    } else {
      onScanStart?.([...selected])
    }
  }

  return (
    <div className="border-b border-green-900/30 bg-[#080d08] max-h-64 overflow-y-auto">
      {/* Quick actions */}
      <div className="flex items-center gap-2 px-3 py-1 border-b border-green-900/20">
        <button onClick={selectAll} className="text-[9px] text-green-700 hover:text-green-400 uppercase">
          All
        </button>
        <span className="text-green-900">|</span>
        <button onClick={selectNone} className="text-[9px] text-green-700 hover:text-green-400 uppercase">
          None
        </button>
        <span className="text-green-900">|</span>
        <span className="text-[9px] text-green-800">
          {selected.size}/{bands.length} selected
        </span>
        <div className="flex-1" />
        <button
          onClick={handleScan}
          disabled={!scanning && selected.size === 0}
          className={`text-[9px] px-2 py-0.5 rounded font-bold ${
            scanning
              ? "bg-red-950 text-red-400 border border-red-900"
              : selected.size === 0
                ? "bg-green-950/30 text-green-900 cursor-not-allowed"
                : "bg-green-950 text-green-400 border border-green-900 hover:bg-green-900"
          }`}
        >
          {scanning ? "STOP" : "SCAN SELECTED"}
        </button>
      </div>

      {/* Band grid */}
      <div className="grid grid-cols-1 divide-y divide-green-900/10">
        {bands.map((band) => {
          const status = bandStatus[band.name] || "idle"
          const statusColor = STATUS_COLORS[status] || STATUS_COLORS.idle
          const isSelected = selected.has(band.name)
          const isScanning = status === "scanning"

          return (
            <label
              key={band.name}
              className={`flex items-center gap-2 px-3 py-1 cursor-pointer hover:bg-green-950/30 transition-colors text-[11px] ${
                isScanning ? "bg-green-950/20" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(band.name)}
                className="accent-green-500 w-3 h-3 shrink-0"
                disabled={scanning}
              />
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${isScanning ? "animate-pulse" : ""}`}
                style={{ backgroundColor: statusColor }}
              />
              <span className="text-green-500 truncate flex-1">{band.description}</span>
              <span className="text-green-800 text-[9px] font-mono shrink-0">
                {band.center_mhz?.toFixed(1)}
              </span>
              <span className="text-green-900 text-[9px] w-8 text-right shrink-0">
                {status !== "idle" ? status.slice(0, 4) : ""}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
