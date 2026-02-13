import { useState, useEffect, useCallback } from "react";

const PAGE_SIZE = 50;
const CATEGORIES = ["all", "ism_sensor", "weather_station", "pager", "aviation", "satellite", "unknown"];
const CAT_LABELS = {
  all: "Tümü",
  ism_sensor: "ISM Sensör",
  weather_station: "Hava İst.",
  pager: "Pager",
  aviation: "Havacılık",
  satellite: "Uydu",
  unknown: "Bilinmeyen",
};
const DECODERS = ["rtl_433", "multimon-ng", "readsb", "satdump"];

export default function DecodeHistory({ sendMessage, onBack }) {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [diskUsage, setDiskUsage] = useState(0);
  const [maxDiskGb, setMaxDiskGb] = useState(10);
  const [page, setPage] = useState(0);
  const [category, setCategory] = useState("all");
  const [starredOnly, setStarredOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [detailJson, setDetailJson] = useState(null);
  const [noteInput, setNoteInput] = useState("");
  const [editingNote, setEditingNote] = useState(null);
  const [reDecodeDecoder, setReDecodeDecoder] = useState("");
  const [wsHandler, setWsHandler] = useState(null);

  const fetchHistory = useCallback(() => {
    sendMessage("get_decode_history", {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      category: category !== "all" ? category : undefined,
      starred_only: starredOnly || undefined,
      search_text: search || undefined,
    });
  }, [sendMessage, page, category, starredOnly, search]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Listen for WS responses via a global event
  useEffect(() => {
    const handler = (data) => {
      switch (data.type) {
        case "decode_history":
          setRecords(data.records || []);
          setTotal(data.total || 0);
          setDiskUsage(data.disk_usage_bytes || 0);
          setMaxDiskGb(data.max_disk_gb || 10);
          break;
        case "star_toggled":
          setRecords((prev) =>
            prev.map((r) =>
              r.id === data.record_id ? { ...r, starred: data.starred } : r
            )
          );
          if (selectedRecord?.id === data.record_id) {
            setSelectedRecord((s) => s ? { ...s, starred: data.starred } : s);
          }
          break;
        case "note_added":
          if (data.ok) {
            setRecords((prev) =>
              prev.map((r) =>
                r.id === data.record_id ? { ...r, notes: noteInput } : r
              )
            );
            setEditingNote(null);
          }
          break;
        case "record_deleted":
          if (data.ok) {
            setRecords((prev) => prev.filter((r) => r.id !== data.record_id));
            setTotal((t) => t - 1);
            if (selectedRecord?.id === data.record_id) {
              setSelectedRecord(null);
            }
          }
          break;
        case "re_decode_complete":
          if (data.record) {
            setRecords((prev) =>
              prev.map((r) => (r.id === data.record.id ? data.record : r))
            );
            setSelectedRecord(data.record);
            try {
              setDetailJson(JSON.parse(data.record.decode_result || "{}"));
            } catch {
              setDetailJson(null);
            }
          }
          break;
      }
    };
    setWsHandler(() => handler);
    window.__historyWsHandler = handler;
    return () => {
      window.__historyWsHandler = null;
    };
  }, [selectedRecord, noteInput]);

  const toggleStar = (id) => sendMessage("toggle_star", { record_id: id });
  const deleteRecord = (id) => sendMessage("delete_record", { record_id: id });
  const reDecode = (id) => {
    sendMessage("re_decode", {
      record_id: id,
      decoder: reDecodeDecoder || undefined,
    });
  };
  const saveNote = (id) => {
    sendMessage("add_note", { record_id: id, text: noteInput });
  };

  const selectRecord = (rec) => {
    setSelectedRecord(rec);
    setNoteInput(rec.notes || "");
    setEditingNote(null);
    setReDecodeDecoder("");
    try {
      setDetailJson(JSON.parse(rec.decode_result || "{}"));
    } catch {
      setDetailJson(null);
    }
  };

  const diskUsedGb = diskUsage / (1024 * 1024 * 1024);
  const diskPct = Math.min(100, (diskUsedGb / maxDiskGb) * 100);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const formatSize = (bytes) => {
    if (!bytes) return "—";
    if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    return `${(bytes / 1e3).toFixed(0)} KB`;
  };

  const formatDate = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "2-digit" })
      + " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 flex-wrap">
        <button
          onClick={onBack}
          className="text-xs text-gray-500 hover:text-green-400 mr-2"
        >
          ← Radar
        </button>

        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(0); }}
          className="bg-gray-800 border border-gray-700 text-xs text-green-400 rounded px-2 py-1"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CAT_LABELS[c] || c}</option>
          ))}
        </select>

        <button
          onClick={() => { setStarredOnly(!starredOnly); setPage(0); }}
          className={`text-xs px-2 py-1 rounded border ${
            starredOnly
              ? "border-yellow-500 text-yellow-400"
              : "border-gray-700 text-gray-500"
          }`}
        >
          {starredOnly ? "★" : "☆"} Yıldızlı
        </button>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchHistory()}
          placeholder="Ara..."
          className="bg-gray-800 border border-gray-700 text-xs text-green-400 rounded px-2 py-1 w-36"
        />

        <button
          onClick={fetchHistory}
          className="text-xs text-gray-500 hover:text-green-400"
        >
          Yenile
        </button>

        <span className="text-[10px] text-gray-600 ml-auto">
          {total} kayıt
        </span>
      </div>

      {/* Table + Detail split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-900 text-gray-500">
              <tr>
                <th className="px-2 py-1 text-left">★</th>
                <th className="px-2 py-1 text-left">Tarih</th>
                <th className="px-2 py-1 text-left">Frekans</th>
                <th className="px-2 py-1 text-left">Bant</th>
                <th className="px-2 py-1 text-left">Protokol</th>
                <th className="px-2 py-1 text-left">Decoder</th>
                <th className="px-2 py-1 text-right">Süre</th>
                <th className="px-2 py-1 text-right">Boyut</th>
                <th className="px-2 py-1 text-right">Decode</th>
                <th className="px-2 py-1 text-right">Weird</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => selectRecord(r)}
                  className={`cursor-pointer border-b border-gray-800/50 hover:bg-gray-800/50 ${
                    selectedRecord?.id === r.id ? "bg-gray-800" : ""
                  }`}
                >
                  <td className="px-2 py-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleStar(r.id); }}
                      className={r.starred ? "text-yellow-400" : "text-gray-700"}
                    >
                      {r.starred ? "★" : "☆"}
                    </button>
                  </td>
                  <td className="px-2 py-1 text-gray-400">{formatDate(r.timestamp)}</td>
                  <td className="px-2 py-1 text-green-400">{r.freq_label || `${(r.freq_hz / 1e6).toFixed(3)}`}</td>
                  <td className="px-2 py-1 text-gray-300">{r.band_name}</td>
                  <td className="px-2 py-1 text-cyan-400">{r.protocol}</td>
                  <td className="px-2 py-1 text-gray-400">{r.decoder_used}</td>
                  <td className="px-2 py-1 text-right text-gray-400">{r.duration_seconds ? `${r.duration_seconds}s` : "—"}</td>
                  <td className="px-2 py-1 text-right text-gray-400">{formatSize(r.file_size_bytes)}</td>
                  <td className="px-2 py-1 text-right">{r.decode_count > 0 ? <span className="text-green-400">{r.decode_count}</span> : <span className="text-gray-600">0</span>}</td>
                  <td className="px-2 py-1 text-right">
                    <WeirdBar score={r.weirdness_score} />
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-600">Kayıt bulunamadı</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        {selectedRecord && (
          <div className="w-80 border-l border-gray-800 overflow-y-auto p-3 space-y-3 flex-shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-green-400">
                {selectedRecord.freq_label || `${(selectedRecord.freq_hz / 1e6).toFixed(3)} MHz`}
              </h3>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-gray-600 hover:text-gray-400 text-xs"
              >x</button>
            </div>

            <div className="space-y-1 text-xs">
              <Row label="Bant" value={selectedRecord.band_name} />
              <Row label="Protokol" value={selectedRecord.protocol} vc="text-cyan-400" />
              <Row label="Kategori" value={selectedRecord.category} />
              <Row label="Decoder" value={selectedRecord.decoder_used} />
              <Row label="Süre" value={`${selectedRecord.duration_seconds || 0}s`} />
              <Row label="Boyut" value={formatSize(selectedRecord.file_size_bytes)} />
              <Row label="Decode" value={selectedRecord.decode_count} />
              <Row label="Weirdness" value={selectedRecord.weirdness_score} />
              {selectedRecord.re_decoded && (
                <Row label="Tekrar Decode" value="Evet" vc="text-yellow-400" />
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => toggleStar(selectedRecord.id)}
                className="text-[10px] px-2 py-1 rounded border border-gray-700 hover:border-yellow-500 text-gray-400"
              >
                {selectedRecord.starred ? "★ Kaldır" : "☆ Yıldızla"}
              </button>
              <button
                onClick={() => setEditingNote(selectedRecord.id)}
                className="text-[10px] px-2 py-1 rounded border border-gray-700 hover:border-green-500 text-gray-400"
              >
                ✏ Not
              </button>
              <button
                onClick={() => deleteRecord(selectedRecord.id)}
                className="text-[10px] px-2 py-1 rounded border border-gray-700 hover:border-red-500 text-gray-400"
              >
                🗑 Sil
              </button>
            </div>

            {/* Note editor */}
            {editingNote === selectedRecord.id && (
              <div className="space-y-1">
                <textarea
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-green-400 resize-none"
                  placeholder="Not ekle..."
                />
                <div className="flex gap-1">
                  <button
                    onClick={() => saveNote(selectedRecord.id)}
                    className="text-[10px] px-2 py-0.5 bg-green-900 rounded text-green-400"
                  >Kaydet</button>
                  <button
                    onClick={() => setEditingNote(null)}
                    className="text-[10px] px-2 py-0.5 text-gray-500"
                  >İptal</button>
                </div>
              </div>
            )}
            {selectedRecord.notes && editingNote !== selectedRecord.id && (
              <div className="text-[10px] text-gray-400 bg-gray-800/50 rounded px-2 py-1">
                {selectedRecord.notes}
              </div>
            )}

            {/* Re-decode */}
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <select
                  value={reDecodeDecoder}
                  onChange={(e) => setReDecodeDecoder(e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-[10px] text-green-400 rounded px-1 py-0.5 flex-1"
                >
                  <option value="">Otomatik</option>
                  {DECODERS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <button
                  onClick={() => reDecode(selectedRecord.id)}
                  className="text-[10px] px-2 py-0.5 bg-blue-900 rounded text-blue-400"
                >
                  🔄 Tekrar Decode
                </button>
              </div>
            </div>

            {/* Decode result JSON */}
            {detailJson && (
              <div className="space-y-1">
                <h4 className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
                  Decode Sonucu
                </h4>
                {detailJson.error && (
                  <div className="text-[10px] text-red-400 bg-red-900/30 rounded px-2 py-1">
                    Hata: {detailJson.error}
                  </div>
                )}
                {detailJson.items && detailJson.items.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {detailJson.items.slice(0, 20).map((item, i) => (
                      <div key={i} className="text-[10px] text-gray-300 bg-gray-800/50 rounded px-2 py-1 break-all">
                        {typeof item === "string" ? item : JSON.stringify(item)}
                      </div>
                    ))}
                    {detailJson.items.length > 20 && (
                      <div className="text-[10px] text-gray-600">
                        +{detailJson.items.length - 20} daha...
                      </div>
                    )}
                  </div>
                )}
                {detailJson._summary && (
                  <div className="text-[10px] text-green-300">{detailJson._summary}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom bar — pagination + disk */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-gray-800 text-xs">
        <div className="flex items-center gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            className="px-2 py-0.5 border border-gray-700 rounded disabled:opacity-30 text-gray-400 hover:text-green-400"
          >
            ◀ Önceki
          </button>
          <span className="text-gray-500">
            {page + 1} / {Math.max(1, totalPages)}
          </span>
          <button
            disabled={page + 1 >= totalPages}
            onClick={() => setPage(page + 1)}
            className="px-2 py-0.5 border border-gray-700 rounded disabled:opacity-30 text-gray-400 hover:text-green-400"
          >
            Sonraki ▶
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] ${diskPct > 90 ? "text-red-400" : diskPct > 70 ? "text-yellow-400" : "text-gray-500"}`}>
              Disk: {diskUsedGb.toFixed(1)} / {maxDiskGb} GB
            </span>
            <div className="w-20 h-1.5 bg-gray-800 rounded overflow-hidden">
              <div
                className={`h-full rounded ${diskPct > 90 ? "bg-red-500" : diskPct > 70 ? "bg-yellow-500" : "bg-green-600"}`}
                style={{ width: `${diskPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, vc = "text-gray-300" }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={vc}>{value ?? "—"}</span>
    </div>
  );
}

function WeirdBar({ score }) {
  if (!score && score !== 0) return <span className="text-gray-600">—</span>;
  const color = score >= 70 ? "bg-red-500" : score >= 40 ? "bg-yellow-500" : "bg-green-600";
  return (
    <div className="flex items-center gap-1">
      <div className="w-8 h-1.5 bg-gray-800 rounded overflow-hidden">
        <div className={`h-full rounded ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-gray-500 w-5 text-right">{score}</span>
    </div>
  );
}
