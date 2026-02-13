import { useMemo } from "react";

export default function RecordControl({
  recording,
  progress,
  recordResult,
  onStop,
}) {
  const pct = useMemo(() => {
    if (!progress || !progress.max_seconds) return 0;
    return Math.min(100, (progress.elapsed_seconds / progress.max_seconds) * 100);
  }, [progress]);

  // Recording complete — show result
  if (recordResult) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-green-400 text-sm">
          <span className="text-green-500">REC OK</span>
          <span>
            {recordResult.decode_count} paket decode edildi
          </span>
        </div>
        {recordResult.protocol && recordResult.protocol !== "unknown" && (
          <div className="text-xs text-gray-400">
            <span className="text-cyan-400">{recordResult.decoder_used}</span>
            {" / "}
            <span className="text-green-300">{recordResult.protocol}</span>
            {recordResult.summary && (
              <span className="text-gray-500 ml-1">— {recordResult.summary}</span>
            )}
          </div>
        )}
        <div className="text-[10px] text-gray-600">
          {recordResult.duration_seconds}s · {(recordResult.file_size_bytes / (1024 * 1024)).toFixed(2)} MB
        </div>
      </div>
    );
  }

  // Not recording
  if (!recording) return null;

  // Recording in progress
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-red-400">REC</span>
        </div>
        <span className="text-gray-500">
          {progress ? `${progress.elapsed_seconds}s / ${progress.max_seconds}s` : "..."}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-800 rounded-full h-1.5">
        <div
          className="bg-red-500 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-gray-600">
        <span>{progress ? `${progress.file_size_mb} MB` : ""}</span>
        <button
          onClick={onStop}
          className="px-2 py-0.5 bg-red-900/50 text-red-400 rounded hover:bg-red-900 text-xs"
        >
          DURDUR
        </button>
      </div>
    </div>
  );
}
