import { useMemo } from "react"

export default function RecordControl({
  recording,
  progress,
  recordResult,
  onStop,
  onDismiss,
}) {
  const pct = useMemo(() => {
    if (!progress || !progress.max_seconds) return 0
    return Math.min(100, (progress.elapsed_seconds / progress.max_seconds) * 100)
  }, [progress])

  // Recording complete — show result
  if (recordResult) {
    const hasDecodes = (recordResult.decode_count || 0) > 0

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px]">
            <span className={hasDecodes ? "text-green-400" : "text-yellow-500"}>
              {hasDecodes ? "REC OK" : "REC DONE"}
            </span>
            <span className={hasDecodes ? "text-green-500" : "text-yellow-600"}>
              {hasDecodes
                ? `${recordResult.decode_count} paket decode edildi`
                : "Decode sonucu yok"}
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="text-[9px] text-green-800 hover:text-green-400"
          >
            [X]
          </button>
        </div>

        {!hasDecodes && (
          <div className="text-[9px] text-yellow-700">
            Sinyal zayif veya decoder uyumsuz
          </div>
        )}

        {hasDecodes && recordResult.protocol && recordResult.protocol !== "unknown" && (
          <div className="text-[10px] text-green-700">
            <span className="text-green-400">{recordResult.decoder_used}</span>
            {" / "}
            <span className="text-green-300">{recordResult.protocol}</span>
            {recordResult.summary && (
              <span className="text-green-800 ml-1">— {recordResult.summary}</span>
            )}
          </div>
        )}
        <div className="text-[9px] text-green-900">
          {recordResult.duration_seconds}s · {((recordResult.file_size_bytes || 0) / (1024 * 1024)).toFixed(2)} MB
        </div>
      </div>
    )
  }

  // Not recording
  if (!recording) return null

  // Recording in progress
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-red-400">REC</span>
        </div>
        <span className="text-green-700 font-mono">
          {progress ? `${progress.elapsed_seconds}s / ${progress.max_seconds}s` : "..."}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-[#060a06] rounded-full h-1.5 border border-green-900/30">
        <div
          className="bg-red-500 h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[9px] text-green-800">
        <span>{progress ? `${progress.file_size_mb} MB` : ""}</span>
        <button
          onClick={onStop}
          className="px-2 py-0.5 bg-red-950/50 text-red-400 rounded border border-red-900/50 hover:bg-red-950 text-[9px] font-bold"
        >
          STOP
        </button>
      </div>
    </div>
  )
}
