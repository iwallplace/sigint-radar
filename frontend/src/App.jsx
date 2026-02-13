import useWebSocket from "./hooks/useWebSocket";
import useSignalData from "./hooks/useSignalData";
import RadarScreen from "./components/RadarScreen";
import SignalList from "./components/SignalList";
import BandCatalog from "./components/BandCatalog";
import DecodePanel from "./components/DecodePanel";

export default function App() {
  const {
    signalList,
    selectedId,
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
    scanStart,
    scanStop,
  } = useWebSocket({
    onSignalNew: addSignal,
    onSignalUpdate: updateSignal,
    onSignalRemoved: removeSignal,
  });

  return (
    <div className="h-screen bg-gray-950 text-green-400 font-mono flex">
      {/* Left panel — Band Catalog */}
      <BandCatalog
        bands={bands}
        bandStatus={bandStatus}
        scanning={scanning}
        signalCount={signalList.length}
        onScanStart={scanStart}
        onScanStop={scanStop}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
          <h1 className="text-xl font-bold tracking-widest">SIGINT RADAR</h1>
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
            <span className="text-gray-600">
              {signalList.length} signals
            </span>
          </div>
        </div>

        {/* Radar + Signal list */}
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
      </div>
    </div>
  );
}
