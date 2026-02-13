import { useState } from "react";
import useWebSocket from "./hooks/useWebSocket";
import useSignalData from "./hooks/useSignalData";
import RadarScreen from "./components/RadarScreen";
import SignalList from "./components/SignalList";
import BandCatalog from "./components/BandCatalog";
import DecodePanel from "./components/DecodePanel";
import SignalDetail from "./components/SignalDetail";
import DecodeHistory from "./components/DecodeHistory";

export default function App() {
  const [activeTab, setActiveTab] = useState("radar");

  const {
    signalList,
    selectedId,
    selectedSignal,
    setSelectedId,
    addSignal,
    updateSignal,
    removeSignal,
  } = useSignalData();

  const {
    connected,
    rtlsdrConnected,
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
  } = useWebSocket({
    onSignalNew: addSignal,
    onSignalUpdate: updateSignal,
    onSignalRemoved: removeSignal,
  });

  return (
    <div className="h-screen bg-gray-950 text-green-400 font-mono flex">
      {/* Left panel — Band Catalog (only on radar tab) */}
      {activeTab === "radar" && (
        <BandCatalog
          bands={bands}
          bandStatus={bandStatus}
          scanning={scanning}
          signalCount={signalList.length}
          onScanStart={scanStart}
          onScanStop={scanStop}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold tracking-widest">SIGINT RADAR</h1>
            <div className="flex gap-1">
              <TabButton
                active={activeTab === "radar"}
                onClick={() => setActiveTab("radar")}
                label="Radar"
              />
              <TabButton
                active={activeTab === "history"}
                onClick={() => setActiveTab("history")}
                label="Geçmiş"
              />
            </div>
          </div>
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  connected ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className={connected ? "text-green-400" : "text-red-400"}>
                WS: {connected ? "on" : "off"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  rtlsdrConnected ? "bg-green-500" : "bg-yellow-500"
                }`}
              />
              <span
                className={
                  rtlsdrConnected ? "text-green-400" : "text-yellow-400"
                }
              >
                SDR: {rtlsdrConnected ? "on" : "no"}
              </span>
            </div>
            {recording && (
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-red-400">REC</span>
              </div>
            )}
            <span className="text-gray-600">
              {signalList.length} signals
            </span>
          </div>
        </div>

        {/* WebSocket disconnected banner */}
        {!connected && (
          <div className="bg-red-900/80 text-red-200 text-xs text-center py-1.5 px-4 animate-pulse">
            WebSocket bağlantısı kesildi — yeniden bağlanılıyor...
          </div>
        )}

        {/* RTL-SDR disconnected banner */}
        {connected && !rtlsdrConnected && activeTab === "radar" && (
          <div className="bg-yellow-900/60 text-yellow-300 text-xs text-center py-1 px-4">
            RTL-SDR bağlı değil
          </div>
        )}

        {/* Tab content */}
        {activeTab === "radar" ? (
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex justify-center">
                <div className="w-full max-w-lg">
                  <RadarScreen
                    signals={signalList}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                  />
                </div>
              </div>

              <div className="w-full">
                <SignalList
                  signals={signalList}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </div>

              <div className="w-full">
                <DecodePanel decodeLines={decodeLines} />
              </div>
            </div>

            {/* Right panel — Signal Detail */}
            {selectedSignal && (
              <SignalDetail
                signal={selectedSignal}
                recording={recording}
                recordProgress={recordProgress}
                recordResult={recordResult}
                onRecordStart={recordStart}
                onRecordStop={recordStop}
                onClose={() => setSelectedId(null)}
              />
            )}
          </div>
        ) : (
          <DecodeHistory
            sendMessage={sendMessage}
            onBack={() => setActiveTab("radar")}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1 rounded transition-colors ${
        active
          ? "bg-gray-800 text-green-400 border border-gray-700"
          : "text-gray-500 hover:text-gray-300 border border-transparent"
      }`}
    >
      {label}
    </button>
  );
}
