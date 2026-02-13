import { useEffect, useRef } from "react";

const DECODER_COLORS = {
  rtl_433: "text-cyan-400",
  "multimon-ng": "text-yellow-400",
  readsb: "text-orange-400",
  satdump: "text-purple-400",
};

const PROTOCOL_BADGE = {
  weather_station: "bg-cyan-900/50 text-cyan-300",
  ism_sensor: "bg-teal-900/50 text-teal-300",
  pager: "bg-yellow-900/50 text-yellow-300",
  aircraft: "bg-orange-900/50 text-orange-300",
  satellite: "bg-purple-900/50 text-purple-300",
};

export default function DecodePanel({ decodeLines = [] }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [decodeLines.length]);

  if (decodeLines.length === 0) {
    return (
      <div className="bg-gray-900/80 border border-gray-800 rounded p-3">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
          Decode Output
        </h3>
        <div className="text-gray-600 text-xs text-center py-4">
          No decode data yet. Start scanning bands with decoders.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/80 border border-gray-800 rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Decode Output
        </h3>
        <span className="text-[10px] text-gray-600">
          {decodeLines.length} lines
        </span>
      </div>

      <div className="max-h-48 overflow-y-auto space-y-0.5 font-mono text-[11px] scrollbar-thin">
        {decodeLines.map((line) => (
          <div
            key={line.id}
            className="flex items-start gap-2 py-0.5 border-b border-gray-800/50 hover:bg-gray-800/30"
          >
            <span className="text-gray-600 shrink-0 w-16">{line.ts}</span>
            <span
              className={`shrink-0 w-16 ${DECODER_COLORS[line.decoder] || "text-gray-400"}`}
            >
              {line.decoder === "multimon-ng" ? "multimon" : line.decoder}
            </span>
            <span className="px-1.5 py-0 rounded text-[10px] shrink-0 bg-gray-800 text-gray-300">
              {line.protocol}
            </span>
            <span className="text-green-300 truncate flex-1">
              {line.summary || `${line.count} packet(s)`}
            </span>
            <span className="text-gray-700 shrink-0 text-[10px]">
              {line.band}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
