import { useState, useEffect, useRef } from "react";

const WS_URL = `ws://${window.location.hostname}:8765`;

export default function App() {
  const [status, setStatus] = useState("disconnected");
  const [message, setMessage] = useState("");
  const [rtlsdrConnected, setRtlsdrConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "connection_status") {
            setRtlsdrConnected(data.rtlsdr_connected);
            setMessage(data.message || "");
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setStatus("disconnected");
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-green-400 flex flex-col items-center justify-center font-mono">
      <h1 className="text-4xl font-bold tracking-widest mb-8">
        SIGINT RADAR
      </h1>

      <div className="flex items-center gap-3 text-lg">
        <span
          className={`inline-block w-3 h-3 rounded-full ${
            status === "connected" ? "bg-green-500" : "bg-red-500"
          }`}
        />
        <span>
          WebSocket:{" "}
          <span
            className={
              status === "connected" ? "text-green-400" : "text-red-400"
            }
          >
            {status}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-3 text-lg mt-2">
        <span
          className={`inline-block w-3 h-3 rounded-full ${
            rtlsdrConnected ? "bg-green-500" : "bg-yellow-500"
          }`}
        />
        <span>
          RTL-SDR:{" "}
          <span
            className={
              rtlsdrConnected ? "text-green-400" : "text-yellow-400"
            }
          >
            {rtlsdrConnected ? "connected" : "not connected"}
          </span>
        </span>
      </div>

      {message && (
        <p className="mt-4 text-sm text-gray-500">{message}</p>
      )}
    </div>
  );
}
