import { useState, useEffect, useRef, useCallback } from "react"

const WS_URL = `ws://${window.location.hostname}:8765`
const MAX_BACKOFF = 30000

const MAX_DECODE_LINES = 200
const MAX_ALERTS = 50

export default function useWebSocket({ onSignalNew, onSignalUpdate, onSignalRemoved } = {}) {
  const [connected, setConnected] = useState(false)
  const [rtlsdrConnected, setRtlsdrConnected] = useState(false)
  const [station, setStation] = useState(null)
  const [region, setRegion] = useState(null)
  const [bands, setBands] = useState([])
  const [bandStatus, setBandStatus] = useState({})
  const [scanning, setScanning] = useState(false)
  const [decodeLines, setDecodeLines] = useState([])
  const [recording, setRecording] = useState(false)
  const [recordProgress, setRecordProgress] = useState(null)
  const [recordResult, setRecordResult] = useState(null)
  const [setupComplete, setSetupComplete] = useState(null)
  const [serverLanguage, setServerLanguage] = useState(null)
  const [serverConfig, setServerConfig] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [spectrumData, setSpectrumData] = useState(null)

  const wsRef = useRef(null)
  const backoffRef = useRef(1000)
  const reconnectTimer = useRef(null)
  const mountedRef = useRef(true)
  const callbacksRef = useRef({ onSignalNew, onSignalUpdate, onSignalRemoved })

  callbacksRef.current = { onSignalNew, onSignalUpdate, onSignalRemoved }

  const connect = useCallback(() => {
    if (!mountedRef.current) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      console.log("[WS] Connected")
      setConnected(true)
      backoffRef.current = 1000
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const cb = callbacksRef.current

        switch (data.type) {
          case "connection_status":
            setRtlsdrConnected(data.rtlsdr_connected)
            if (data.station) setStation(data.station)
            if (data.region) setRegion(data.region)
            if (data.bands) setBands(data.bands)
            if (data.band_status) setBandStatus(data.band_status)
            if (data.scanning !== undefined) setScanning(data.scanning)
            if (data.setup_complete !== undefined) setSetupComplete(data.setup_complete)
            if (data.language) setServerLanguage(data.language)
            if (data.config) setServerConfig(data.config)
            if (data.signals) {
              for (const sig of data.signals) {
                cb.onSignalNew?.(sig)
              }
            }
            break

          case "rtlsdr_status":
            setRtlsdrConnected(data.connected)
            break

          case "signal_new":
            cb.onSignalNew?.(data.signal)
            break

          case "signal_update":
            cb.onSignalUpdate?.(data.signal)
            break

          case "signal_removed":
            cb.onSignalRemoved?.(data.signal_id)
            break

          case "alert":
            setAlerts((prev) => {
              const next = [...prev, { ...data, _id: Date.now() + Math.random() }]
              return next.length > MAX_ALERTS ? next.slice(-MAX_ALERTS) : next
            })
            break

          case "config_updated":
            if (data.config) setServerConfig(data.config)
            break

          case "spectrum":
            setSpectrumData(data)
            break

          case "decode_line":
            setDecodeLines((prev) => {
              const next = [
                ...prev,
                {
                  id: Date.now() + Math.random(),
                  ts: new Date().toLocaleTimeString(),
                  decoder: data.decoder,
                  protocol: data.protocol,
                  summary: data.summary,
                  count: data.count,
                  band: data.band,
                },
              ]
              return next.length > MAX_DECODE_LINES
                ? next.slice(-MAX_DECODE_LINES)
                : next
            })
            break

          case "record_started":
            setRecording(true)
            setRecordProgress(null)
            setRecordResult(null)
            break

          case "record_progress":
            setRecordProgress({
              elapsed_seconds: data.elapsed_seconds,
              file_size_mb: data.file_size_mb,
              max_seconds: data.max_seconds,
            })
            break

          case "record_complete":
            setRecording(false)
            setRecordProgress(null)
            setRecordResult({
              record_id: data.record_id,
              decode_count: data.decode_count,
              protocol: data.protocol,
              category: data.category,
              decoder_used: data.decoder_used,
              duration_seconds: data.duration_seconds,
              file_size_bytes: data.file_size_bytes,
              summary: data.summary,
            })
            break

          case "record_error":
            setRecording(false)
            setRecordProgress(null)
            console.error("[WS] Record error:", data.error)
            break

          case "scan_resumed":
            setScanning(true)
            break

          case "scan_band_active":
            break

          case "band_status_update":
            if (data.band_status) setBandStatus(data.band_status)
            break

          case "scan_stopped":
            setScanning(false)
            break

          case "bands_list":
            if (data.bands) setBands(data.bands)
            if (data.band_status) setBandStatus(data.band_status)
            break

          case "decode_history":
          case "star_toggled":
          case "note_added":
          case "record_deleted":
          case "re_decode_complete":
          case "disk_usage":
            // Forward to history panel handler
            if (window.__historyWsHandler) {
              window.__historyWsHandler(data)
            }
            break

          case "error":
            console.warn("[WS] Error:", data.action, data.message)
            break

          default:
            console.log("[WS]", data.type, data)
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => {
      setConnected(false)
      if (!mountedRef.current) return

      const delay = backoffRef.current
      console.log(`[WS] Disconnected — reconnecting in ${delay}ms`)
      backoffRef.current = Math.min(delay * 2, MAX_BACKOFF)
      reconnectTimer.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      clearTimeout(reconnectTimer.current)
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect])

  const sendMessage = useCallback((action, data = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: action, ...data }))
    }
  }, [])

  const scanStart = useCallback((bandNames) => {
    setScanning(true)
    sendMessage("scan_start", { bands: bandNames })
  }, [sendMessage])

  const scanStop = useCallback(() => {
    sendMessage("scan_stop")
  }, [sendMessage])

  const recordStart = useCallback((signal, duration) => {
    setRecordResult(null)
    sendMessage("record_start", {
      freq_hz: signal.freq_hz,
      duration,
      signal: {
        band_name: signal.band_name,
        power_db: signal.power_db,
        estimated_distance_km: signal.estimated_distance_km,
        weirdness_score: signal.weirdness_score,
      },
    })
  }, [sendMessage])

  const recordStop = useCallback(() => {
    sendMessage("record_stop")
  }, [sendMessage])

  const clearRecordResult = useCallback(() => {
    setRecordResult(null)
  }, [])

  return {
    connected,
    rtlsdrConnected,
    station,
    region,
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
  }
}
