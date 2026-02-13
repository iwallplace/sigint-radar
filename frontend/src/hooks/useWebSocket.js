import { useState, useEffect, useRef, useCallback } from "react";

const WS_URL = `ws://${window.location.hostname}:8765`;
const MAX_BACKOFF = 30000;

export default function useWebSocket({ onSignalNew, onSignalUpdate, onSignalRemoved } = {}) {
  const [connected, setConnected] = useState(false);
  const [rtlsdrConnected, setRtlsdrConnected] = useState(false);
  const [station, setStation] = useState(null);
  const [region, setRegion] = useState(null);

  const wsRef = useRef(null);
  const backoffRef = useRef(1000);
  const reconnectTimer = useRef(null);
  const mountedRef = useRef(true);
  const callbacksRef = useRef({ onSignalNew, onSignalUpdate, onSignalRemoved });

  callbacksRef.current = { onSignalNew, onSignalUpdate, onSignalRemoved };

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
        const cb = callbacksRef.current;

        switch (data.type) {
          case "connection_status":
            setRtlsdrConnected(data.rtlsdr_connected);
            if (data.station) setStation(data.station);
            if (data.region) setRegion(data.region);
            if (data.signals) {
              for (const sig of data.signals) {
                cb.onSignalNew?.(sig);
              }
            }
            break;

          case "rtlsdr_status":
            setRtlsdrConnected(data.connected);
            break;

          case "signal_new":
            cb.onSignalNew?.(data.signal);
            break;

          case "signal_update":
            cb.onSignalUpdate?.(data.signal);
            break;

          case "signal_removed":
            cb.onSignalRemoved?.(data.signal_id);
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

  return { connected, rtlsdrConnected, station, region, sendMessage };
}
