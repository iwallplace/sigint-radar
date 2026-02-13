import useWebSocket from "./hooks/useWebSocket";
import useSignalData from "./hooks/useSignalData";
import RadarScreen from "./components/RadarScreen";
import SignalList from "./components/SignalList";

export default function App() {
  const {
    signalList,
    selectedId,
    setSelectedId,
    addSignal,
    updateSignal,
    removeSignal,
  } = useSignalData();

  const { connected, rtlsdrConnected } = useWebSocket({
    onSignalNew: addSignal,
    onSignalUpdate: updateSignal,
    onSignalRemoved: removeSignal,
  });

  return (
    <div className="min-h-screen bg-gray-950 text-green-400 flex flex-col items-center font-mono p-4">
      <h1 className="text-3xl font-bold tracking-widest mb-4 mt-4">
        SIGINT RADAR
      </h1>

      <div className="flex gap-6 mb-4 text-sm">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              connected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className={connected ? "text-green-400" : "text-red-400"}>
            WS: {connected ? "connected" : "disconnected"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              rtlsdrConnected ? "bg-green-500" : "bg-yellow-500"
            }`}
          />
          <span
            className={
              rtlsdrConnected ? "text-green-400" : "text-yellow-400"
            }
          >
            SDR: {rtlsdrConnected ? "connected" : "no device"}
          </span>
        </div>

        <span className="text-gray-600">
          Signals: {signalList.length}
        </span>
      </div>

      <div className="w-full max-w-2xl">
        <RadarScreen
          signals={signalList}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      <div className="w-full max-w-4xl mt-4">
        <SignalList
          signals={signalList}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
    </div>
  );
}
