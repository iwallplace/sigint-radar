import { useState, useEffect, useCallback, useRef } from "react"
import { useI18n } from "../i18n"

export default function WeirdnessAlert({ alerts, soundEnabled, desktopEnabled, onShow }) {
  const { t } = useI18n()
  const [visible, setVisible] = useState([])
  const audioCtxRef = useRef(null)

  const playBeep = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      }
      const ctx = audioCtxRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = "square"
      osc.frequency.value = 880
      gain.gain.value = 0.15
      osc.start()
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.stop(ctx.currentTime + 0.3)
    } catch {
      // ignore audio errors
    }
  }, [])

  const sendDesktopNotification = useCallback((alert) => {
    if (!("Notification" in window)) return
    if (Notification.permission === "default") {
      Notification.requestPermission()
      return
    }
    if (Notification.permission === "granted") {
      const freq = (alert.signal?.freq_hz / 1e6).toFixed(3)
      new Notification("SIGINT RADAR — Unusual Signal", {
        body: `${freq} MHz — ${alert.signal?.protocol || "unknown"} — Weirdness: ${alert.weirdness}`,
        icon: "/favicon.ico",
      })
    }
  }, [])

  useEffect(() => {
    if (!alerts || alerts.length === 0) return

    const latest = alerts[alerts.length - 1]
    if (!latest) return

    // Check if already showing this alert
    if (visible.find((v) => v._id === latest._id)) return

    const entry = { ...latest, _id: latest._id || Date.now() + Math.random() }
    setVisible((prev) => [...prev, entry])

    if (soundEnabled) playBeep()
    if (desktopEnabled) sendDesktopNotification(entry)

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setVisible((prev) => prev.filter((v) => v._id !== entry._id))
    }, 5000)
  }, [alerts, soundEnabled, desktopEnabled, playBeep, sendDesktopNotification])

  const dismiss = (id) => {
    setVisible((prev) => prev.filter((v) => v._id !== id))
  }

  if (visible.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {visible.map((alert) => {
        const freq = (alert.signal?.freq_hz / 1e6).toFixed(3)
        return (
          <div
            key={alert._id}
            className="bg-red-950/95 border border-red-800 rounded-lg px-4 py-3 shadow-lg animate-slide-in"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-red-400 mb-1">
                  {t("alert.unusual_signal")}
                </div>
                <div className="text-xs text-gray-300 space-y-0.5">
                  <div className="font-mono">{freq} MHz — {alert.signal?.protocol || "unknown"}</div>
                  <div>
                    {t("alert.weirdness")}: <span className="text-red-400 font-bold">{alert.weirdness}</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (onShow && alert.signal?.id) onShow(alert.signal.id)
                    dismiss(alert._id)
                  }}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 mt-1.5"
                >
                  [{t("alert.show")}]
                </button>
              </div>
              <button
                onClick={() => dismiss(alert._id)}
                className="text-gray-600 hover:text-gray-400 text-xs leading-none"
              >
                x
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
