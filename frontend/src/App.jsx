import useWebSocket from "./hooks/useWebSocket";

export default function App() {
  const { connected, rtlsdrConnected, signals } = useWebSocket();

  return (
    <div className="min-h-screen bg-gray-950 text-green-400 flex flex-col items-center font-mono p-6">
      <h1 className="text-4xl font-bold tracking-widest mb-8 mt-8">
        SIGINT RADAR
      </h1>

      <div className="flex gap-8 mb-6">
        <div className="flex items-center gap-2 text-lg">
          <span
            className={`inline-block w-3 h-3 rounded-full ${
              connected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span>
            WS:{" "}
            <span className={connected ? "text-green-400" : "text-red-400"}>
              {connected ? "connected" : "disconnected"}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2 text-lg">
          <span
            className={`inline-block w-3 h-3 rounded-full ${
              rtlsdrConnected ? "bg-green-500" : "bg-yellow-500"
            }`}
          />
          <span>
            SDR:{" "}
            <span
              className={
                rtlsdrConnected ? "text-green-400" : "text-yellow-400"
              }
            >
              {rtlsdrConnected ? "connected" : "no device"}
            </span>
          </span>
        </div>
      </div>

      <div className="w-full max-w-3xl">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-500">
            Signals ({signals.length})
          </span>
        </div>

        <div className="border border-gray-800 rounded max-h-96 overflow-y-auto">
          {signals.length === 0 ? (
            <p className="text-gray-600 text-center py-8">
              Waiting for signals...
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-gray-500 border-b border-gray-800 sticky top-0 bg-gray-950">
                <tr>
                  <th className="text-left px-3 py-2">Freq</th>
                  <th className="text-left px-3 py-2">Protocol</th>
                  <th className="text-left px-3 py-2">Band</th>
                  <th className="text-right px-3 py-2">dB</th>
                  <th className="text-right px-3 py-2">SNR</th>
                  <th className="text-right px-3 py-2">Dist</th>
                  <th className="text-right px-3 py-2">W</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s) => (
                  <tr
                    key={s.id}
                    className={`border-b border-gray-900 hover:bg-gray-900 ${
                      s.weirdness_score >= 40 ? "text-red-400" : ""
                    }`}
                  >
                    <td className="px-3 py-1">
                      {(s.freq_hz / 1e6).toFixed(3)} MHz
                    </td>
                    <td className="px-3 py-1">{s.protocol}</td>
                    <td className="px-3 py-1 text-gray-500">{s.band_name}</td>
                    <td className="px-3 py-1 text-right">
                      {s.power_db?.toFixed(1)}
                    </td>
                    <td className="px-3 py-1 text-right">
                      {s.snr_db?.toFixed(1)}
                    </td>
                    <td className="px-3 py-1 text-right">
                      {s.estimated_distance_km?.toFixed(1)} km
                    </td>
                    <td className="px-3 py-1 text-right">
                      {s.weirdness_score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
