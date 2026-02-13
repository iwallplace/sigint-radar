import { useState, useEffect, useMemo } from "react"
import { useI18n } from "./i18n"
import useWebSocket from "./hooks/useWebSocket"
import useSignalData from "./hooks/useSignalData"
import RadarScreen from "./components/RadarScreen"
import SignalPanel from "./components/SignalPanel"
import BandCatalog from "./components/BandCatalog"
import DecodePanel from "./components/DecodePanel"
import SignalDetail from "./components/SignalDetail"
import SetupWizard from "./components/SetupWizard"
import WeirdnessAlert from "./components/WeirdnessAlert"
import DecodeHistory from "./components/DecodeHistory"

export default function App() {
  const { t, setLang } = useI18n()

  const {
    signalList,
    selectedId,
    selectedSignal,
    setSelectedId,
    addSignal,
    updateSignal,
    removeSignal,
  } = useSignalData()

  const {
    connected,
    rtlsdrConnected,
    station,
    bands,
    bandStatus,
    scanning,
    decodeLines,
    recording,
    recordProgress,
    recordResult,
    sendMessage,
    scanStart,
    scanStop,
    recordStart,
    recordStop,
    clearRecordResult,
    setupComplete,
    serverLanguage,
    serverConfig,
    alerts,
    spectrumData,
  } = useWebSocket({
    onSignalNew: addSignal,
    onSignalUpdate: updateSignal,
    onSignalRemoved: removeSignal,
  })

  const [catalogOpen, setCatalogOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [historyOpen, setHistoryOpen] = useState(false)

  // Sync language from server
  useEffect(() => {
    if (serverLanguage) {
      setLang(serverLanguage)
    }
  }, [serverLanguage, setLang])

  // Clear record result when selected signal changes
  useEffect(() => {
    clearRecordResult()
  }, [selectedId, clearRecordResult])

  // Auto-dismiss record result after 5 seconds
  useEffect(() => {
    if (!recordResult) return
    const timer = setTimeout(() => {
      clearRecordResult()
    }, 5000)
    return () => clearTimeout(timer)
  }, [recordResult, clearRecordResult])

  // Filter signals by category (must be before early returns — React hooks rule)
  const filteredSignals = useMemo(() => {
    if (categoryFilter === "all") return signalList
    return signalList.filter((s) => s.category === categoryFilter)
  }, [signalList, categoryFilter])

  // Count signals per category
  const categoryCounts = useMemo(() => {
    const counts = {}
    for (const s of signalList) {
      const cat = s.category || "unknown"
      counts[cat] = (counts[cat] || 0) + 1
    }
    return counts
  }, [signalList])

  // Show setup wizard if setup not complete (null = loading)
  if (setupComplete === false) {
    return (
      <SetupWizard
        sendMessage={sendMessage}
        rtlsdrConnected={rtlsdrConnected}
        bands={bands}
      />
    )
  }

  // Loading state while waiting for connection_status
  if (setupComplete === null && !connected) {
    return (
      <div className="h-screen bg-[#0a0f0a] text-green-400 font-mono flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="text-xl font-bold tracking-widest">SIGINT RADAR</div>
          <div className="text-xs text-gray-500 animate-pulse">
            Connecting...
          </div>
        </div>
      </div>
    )
  }

  const alertConfig = serverConfig?.alerts || {}
  const stationConfig = serverConfig?.station || station || {}
  const stationName = stationConfig.name || "SIGINT-01"
  const lat = stationConfig.lat?.toFixed(4) || "0.0000"
  const lon = stationConfig.lon?.toFixed(4) || "0.0000"
  const radarRange = serverConfig?.ui?.radar_range_km || 60

  return (
    <div className="h-screen bg-[#0a0f0a] text-green-400 font-mono flex flex-col overflow-hidden select-none">
      {/* Weirdness alert toasts */}
      <WeirdnessAlert
        alerts={alerts}
        soundEnabled={alertConfig.sound !== false}
        desktopEnabled={alertConfig.desktop_notification !== false}
        onShow={(signalId) => setSelectedId(signalId)}
      />

      {/* ===== TOP BAR ===== */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-green-900/40 bg-[#0a0f0a] z-30 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold tracking-[0.3em] text-green-400">
            SIGINT RADAR
          </h1>
          <span className="text-green-900">|</span>
          <span className="text-xs text-green-600">{stationName}</span>
          <span className="text-green-900">|</span>
          <span className="text-xs text-green-700 font-mono">
            {lat}°N {lon}°E
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs">
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
            <span className={connected ? "text-green-600" : "text-red-500"}>
              {connected ? "WS" : "WS OFF"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${rtlsdrConnected ? "bg-green-500" : "bg-yellow-600"}`} />
            <span className={rtlsdrConnected ? "text-green-600" : "text-yellow-600"}>
              {rtlsdrConnected ? "SDR" : "NO SDR"}
            </span>
          </div>
          {recording && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-400">REC</span>
            </div>
          )}
          <button
            onClick={() => setHistoryOpen(true)}
            className="text-[10px] px-2 py-0.5 border border-green-900/50 rounded text-green-700 hover:text-green-400 hover:border-green-700 tracking-wider font-bold"
          >
            HISTORY
          </button>
          <span className="text-green-800">
            {signalList.length} {t("app.signals")}
          </span>
        </div>
      </div>

      {/* Disconnected banners */}
      {!connected && (
        <div className="bg-red-950/80 text-red-300 text-xs text-center py-1 px-4 animate-pulse shrink-0">
          {t("status.ws_disconnected")}
        </div>
      )}

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex-1 flex overflow-hidden">

        {/* ===== LEFT PANEL ===== */}
        <div className="w-[380px] min-w-[340px] flex flex-col border-r border-green-900/30 bg-[#0b100b]">

          {/* Band catalog toggle + scan button */}
          <div className="px-3 py-2 border-b border-green-900/30 space-y-2">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setCatalogOpen(!catalogOpen)}
                className="text-[10px] tracking-wider text-green-600 hover:text-green-400 uppercase font-bold"
              >
                {catalogOpen ? "[-] BAND CATALOG" : "[+] BAND CATALOG"}
              </button>
              <button
                onClick={() => {
                  if (scanning) {
                    scanStop()
                  } else {
                    const enabledBands = bands.filter((b) => b.enabled).map((b) => b.name)
                    scanStart(enabledBands.length > 0 ? enabledBands : bands.map((b) => b.name))
                  }
                }}
                className={`px-4 py-1 text-xs font-bold rounded tracking-wider transition-colors ${
                  scanning
                    ? "bg-red-950 border border-red-800 text-red-400 hover:bg-red-900"
                    : "bg-green-950 border border-green-800 text-green-400 hover:bg-green-900"
                }`}
              >
                {scanning ? "STOP SCAN" : "FULL SPECTRUM SCAN"}
              </button>
            </div>

            {/* Signal count + category filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-green-700">
                SIGNALS: <span className="text-green-400 font-bold">{signalList.length}</span>
              </span>
              <span className="text-green-900">|</span>
              <CategoryChip
                label="ALL"
                active={categoryFilter === "all"}
                count={signalList.length}
                onClick={() => setCategoryFilter("all")}
              />
              {Object.entries(categoryCounts).map(([cat, count]) => (
                <CategoryChip
                  key={cat}
                  label={cat.toUpperCase().replace("_", " ")}
                  active={categoryFilter === cat}
                  count={count}
                  onClick={() => setCategoryFilter(cat)}
                />
              ))}
            </div>
          </div>

          {/* Band catalog (collapsible) */}
          {catalogOpen && (
            <BandCatalog
              bands={bands}
              bandStatus={bandStatus}
              scanning={scanning}
              signalCount={signalList.length}
              onScanStart={scanStart}
              onScanStop={scanStop}
            />
          )}

          {/* Signal list */}
          <div className="flex-1 overflow-y-auto">
            <SignalPanel
              signals={filteredSignals}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>

          {/* Decode output at bottom */}
          <div className="border-t border-green-900/30 max-h-40 overflow-y-auto">
            <DecodePanel decodeLines={decodeLines} />
          </div>
        </div>

        {/* ===== RIGHT — RADAR ===== */}
        <div className="flex-1 flex overflow-hidden relative">
          <div className="flex-1 flex items-center justify-center p-2">
            <RadarScreen
              signals={filteredSignals}
              selectedId={selectedId}
              onSelect={setSelectedId}
              rangeKm={radarRange}
              stationName={stationName}
            />
          </div>

          {/* Signal detail overlay */}
          {selectedSignal && (
            <div className="absolute top-2 right-2 z-20">
              <SignalDetail
                signal={selectedSignal}
                recording={recording}
                recordProgress={recordProgress}
                recordResult={recordResult}
                onRecordStart={recordStart}
                onRecordStop={recordStop}
                onClearRecord={clearRecordResult}
                onClose={() => setSelectedId(null)}
              />
            </div>
          )}
        </div>
      </div>

      {/* History overlay */}
      {historyOpen && (
        <DecodeHistory
          sendMessage={sendMessage}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  )
}

function CategoryChip({ label, active, count, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition-colors ${
        active
          ? "bg-green-900/60 text-green-300 border border-green-700"
          : "text-green-800 hover:text-green-600 border border-transparent"
      }`}
    >
      {label} {count > 0 && <span className="text-green-600">({count})</span>}
    </button>
  )
}
