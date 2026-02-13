import { useState, useEffect, useRef, useCallback } from "react";

const WS_URL = `ws://${window.location.hostname}:8765`;
const MAX_BACKOFF = 30000;

export default function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [rtlsdrConnected, setRtlsdrConnected] = useState(false);
  const [signals, setSignals] = useState([]);
  const [station, setStation] = useState(null);
  const [region, setRegion] = useState(null);

  const wsRef = useRef(null);
  const backoffRef = useRef(1000);
  const reconnectTimer = useRef(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] Connected");
      setConnected(true);
      backoffRef.current = 1000;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "connection_status":
            setRtlsdrConnected(data.rtlsdr_connected);
            if (data.station) setStation(data.station);
            if (data.region) setRegion(data.region);
            break;

          case "rtlsdr_status":
            setRtlsdrConnected(data.connected);
            break;

          case "signal_new":
            console.log("[Signal]", data.signal.protocol, data.signal.freq_hz);
            setSignals((prev) => {
              const next = [data.signal, ...prev];
              return next.length > 100 ? next.slice(0, 100) : next;
            });
            break;

          case "signal_update":
            setSignals((prev) =>
              prev.map((s) =>
                s.id === data.signal.id ? { ...s, ...data.signal } : s
              )
            );
            break;

          case "signal_removed":
            setSignals((prev) =>
              prev.filter((s) => s.id !== data.signal_id)
            );
            break;

          case "error":
            console.warn("[WS] Error:", data.action, data.message);
            break;

          default:
            console.log("[WS]", data.type, data);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (!mountedRef.current) return;

      const delay = backoffRef.current;
      console.log(`[WS] Disconnected — reconnecting in ${delay}ms`);
      backoffRef.current = Math.min(delay * 2, MAX_BACKOFF);
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((action, data = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: action, ...data }));
    }
  }, []);

  return { connected, rtlsdrConnected, signals, station, region, sendMessage };
}
