import { useEffect, useRef } from "react"

const DECODER_COLORS = {
  rtl_433: "text-green-400",
  "multimon-ng": "text-yellow-500",
  readsb: "text-orange-400",
  satdump: "text-purple-400",
  dumpvdl2: "text-cyan-400",
  direwolf: "text-blue-400",
}

export default function DecodePanel({ decodeLines = [] }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [decodeLines.length])

  if (decodeLines.length === 0) {
    return (
      <div className="px-3 py-2 text-green-900 text-[10px] text-center">
        DECODE OUTPUT IDLE
      </div>
    )
  }

  return (
    <div className="px-2 py-1">
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-[9px] text-green-800 uppercase tracking-wider font-bold">
          Decode Output
        </span>
        <span className="text-[9px] text-green-900">
          {decodeLines.length}
        </span>
      </div>

      <div className="space-y-0 font-mono text-[10px]">
        {decodeLines.slice(-20).map((line) => (
          <div
            key={line.id}
            className="flex items-start gap-1.5 py-0.5 border-b border-green-900/10"
          >
            <span className="text-green-900 shrink-0 w-14">{line.ts}</span>
            <span
              className={`shrink-0 w-12 ${DECODER_COLORS[line.decoder] || "text-green-600"}`}
            >
              {line.decoder === "multimon-ng" ? "mmon" : line.decoder}
            </span>
            <span className="text-green-700 shrink-0">{line.protocol}</span>
            <span className="text-green-500 truncate flex-1">
              {line.summary || `${line.count} pkt`}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
