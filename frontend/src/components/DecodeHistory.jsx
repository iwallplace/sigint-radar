import { useState, useEffect, useCallback, useRef } from "react"

const PAGE_SIZE = 50
const CATEGORIES = ["all", "ism_sensor", "weather_station", "pager", "aircraft", "satellite", "fm_broadcast", "unknown"]
const CAT_LABELS = {
  all: "ALL",
  ism_sensor: "ISM",
  weather_station: "WEATHER",
  pager: "PAGER",
  aircraft: "AVIATION",
  satellite: "SAT",
  fm_broadcast: "FM",
  unknown: "UNKNOWN",
}
const DECODERS = ["rtl_433", "multimon-ng", "readsb", "satdump", "rtl_fm"]

const API_BASE = `http://${window.location.hostname}:8080`

export default function DecodeHistory({ sendMessage, onClose }) {
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [diskUsage, setDiskUsage] = useState(0)
  const [maxDiskGb, setMaxDiskGb] = useState(10)
  const [page, setPage] = useState(0)
  const [category, setCategory] = useState("all")
  const [starredOnly, setStarredOnly] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [detailJson, setDetailJson] = useState(null)
  const [noteInput, setNoteInput] = useState("")
  const [editingNote, setEditingNote] = useState(null)
  const [reDecodeDecoder, setReDecodeDecoder] = useState("")
  const [folders, setFolders] = useState([])
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [playingAudio, setPlayingAudio] = useState(null)
  const audioRef = useRef(null)

  const fetchHistory = useCallback(() => {
    sendMessage("get_decode_history", {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      category: category !== "all" ? category : undefined,
      starred_only: starredOnly || undefined,
      search_text: search || (selectedFolder ? selectedFolder : undefined),
    })
  }, [sendMessage, page, category, starredOnly, search, selectedFolder])

  const fetchFolders = useCallback(() => {
    sendMessage("get_folder_tree", {})
  }, [sendMessage])

  useEffect(() => {
    fetchHistory()
    fetchFolders()
  }, [fetchHistory, fetchFolders])

  useEffect(() => {
    const handler = (data) => {
      switch (data.type) {
        case "decode_history":
          setRecords(data.records || [])
          setTotal(data.total || 0)
          setDiskUsage(data.disk_usage_bytes || 0)
          setMaxDiskGb(data.max_disk_gb || 10)
          break
        case "folder_tree":
          setFolders(data.folders || [])
          break
        case "star_toggled":
          setRecords((prev) =>
            prev.map((r) =>
              r.id === data.record_id ? { ...r, starred: data.starred } : r
            )
          )
          if (selectedRecord?.id === data.record_id) {
            setSelectedRecord((s) => (s ? { ...s, starred: data.starred } : s))
          }
          break
        case "note_added":
          if (data.ok) {
            setRecords((prev) =>
              prev.map((r) =>
                r.id === data.record_id ? { ...r, notes: noteInput } : r
              )
            )
            setEditingNote(null)
          }
          break
        case "record_deleted":
          if (data.ok) {
            setRecords((prev) => prev.filter((r) => r.id !== data.record_id))
            setTotal((t) => t - 1)
            if (selectedRecord?.id === data.record_id) {
              setSelectedRecord(null)
            }
            fetchFolders()
          }
          break
        case "re_decode_complete":
          if (data.record) {
            setRecords((prev) =>
              prev.map((r) => (r.id === data.record.id ? data.record : r))
            )
            setSelectedRecord(data.record)
            try {
              setDetailJson(JSON.parse(data.record.decode_result || "{}"))
            } catch {
              setDetailJson(null)
            }
            fetchFolders()
          }
          break
      }
    }
    window.__historyWsHandler = handler
    return () => {
      window.__historyWsHandler = null
    }
  }, [selectedRecord, noteInput, fetchFolders])

  const toggleStar = (id) => sendMessage("toggle_star", { record_id: id })
  const deleteRecord = (id) => sendMessage("delete_record", { record_id: id })
  const reDecode = (id) => {
    sendMessage("re_decode", {
      record_id: id,
      decoder: reDecodeDecoder || undefined,
    })
  }
  const saveNote = (id) => {
    sendMessage("add_note", { record_id: id, text: noteInput })
  }

  const selectRecord = (rec) => {
    setSelectedRecord(rec)
    setNoteInput(rec.notes || "")
    setEditingNote(null)
    setReDecodeDecoder("")
    try {
      setDetailJson(JSON.parse(rec.decode_result || "{}"))
    } catch {
      setDetailJson(null)
    }
  }

  const playAudio = (recordId) => {
    const url = `${API_BASE}/api/history/${recordId}/wav`
    if (playingAudio === recordId) {
      // Stop
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setPlayingAudio(null)
    } else {
      // Play
      if (audioRef.current) {
        audioRef.current.pause()
      }
      const audio = new Audio(url)
      audio.onended = () => setPlayingAudio(null)
      audio.onerror = () => setPlayingAudio(null)
      audio.play().catch(() => setPlayingAudio(null))
      audioRef.current = audio
      setPlayingAudio(recordId)
    }
  }

  const hasWav = (rec) => {
    // Check if this record might have a WAV file (FM broadcast or multimon-ng)
    const decoder = rec.decoder_used || ""
    const cat = rec.category || ""
    return decoder === "rtl_fm" || decoder === "multimon-ng" || cat === "fm_broadcast"
  }

  const diskUsedGb = diskUsage / (1024 * 1024 * 1024)
  const diskPct = Math.min(100, (diskUsedGb / maxDiskGb) * 100)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const formatSize = (bytes) => {
    if (!bytes) return "\u2014"
    if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
    if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
    return `${(bytes / 1e3).toFixed(0)} KB`
  }

  const formatDate = (ts) => {
    if (!ts) return "\u2014"
    const d = new Date(ts)
    return (
      d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
      " " +
      d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    )
  }

  const fmtDuration = (s) => {
    if (!s) return "\u2014"
    const m = Math.floor(s / 60)
    const sec = Math.round(s % 60)
    return m > 0 ? `${m}m${sec}s` : `${sec}s`
  }

  // Filter records by selected folder (protocol name)
  const filteredRecords = selectedFolder
    ? records.filter((r) => r.protocol === selectedFolder || r.category === selectedFolder)
    : records

  return (
    <div className="fixed inset-0 z-40 bg-[#0a0f0a]/95 flex flex-col font-mono text-green-400">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-green-900/40 flex-wrap shrink-0">
        <button
          onClick={onClose}
          className="text-xs text-green-800 hover:text-green-400 font-bold"
        >
          [X] CLOSE
        </button>
        <span className="text-xs font-bold tracking-widest text-green-500">
          DECODE HISTORY
        </span>

        <div className="flex items-center gap-1 ml-4">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => {
                setCategory(c)
                setPage(0)
                setSelectedFolder(null)
              }}
              className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition-colors ${
                category === c && !selectedFolder
                  ? "bg-green-900/60 text-green-300 border border-green-700"
                  : "text-green-800 hover:text-green-600 border border-transparent"
              }`}
            >
              {CAT_LABELS[c] || c}
            </button>
          ))}
        </div>

        <button
          onClick={() => {
            setStarredOnly(!starredOnly)
            setPage(0)
          }}
          className={`text-[10px] px-1.5 py-0.5 rounded border ${
            starredOnly
              ? "border-yellow-700 text-yellow-400"
              : "border-green-900/30 text-green-800"
          }`}
        >
          {starredOnly ? "\u2605" : "\u2606"}
        </button>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchHistory()}
          placeholder="Search..."
          className="bg-[#060a06] border border-green-900/50 text-[10px] text-green-400 rounded px-2 py-0.5 w-28 font-mono"
        />

        <button
          onClick={() => { fetchHistory(); fetchFolders() }}
          className="text-[9px] text-green-800 hover:text-green-400"
        >
          REFRESH
        </button>

        <span className="text-[9px] text-green-800 ml-auto">
          {total} records
        </span>
      </div>

      {/* Main content: folder tree + table + detail */}
      <div className="flex-1 flex overflow-hidden">
        {/* Folder tree (left side) */}
        <div className="w-44 min-w-[140px] border-r border-green-900/30 overflow-y-auto bg-[#080d08] p-2 space-y-0.5 shrink-0">
          <div className="text-[9px] text-green-800 uppercase tracking-wider font-bold mb-2">
            Protocol Folders
          </div>
          <button
            onClick={() => { setSelectedFolder(null); setPage(0) }}
            className={`w-full text-left text-[10px] px-2 py-1 rounded truncate transition-colors ${
              !selectedFolder
                ? "bg-green-900/40 text-green-400"
                : "text-green-700 hover:text-green-400 hover:bg-green-950/30"
            }`}
          >
            ALL ({total})
          </button>
          {folders.map((f) => (
            <button
              key={f.name}
              onClick={() => { setSelectedFolder(f.name); setPage(0); setCategory("all") }}
              className={`w-full text-left text-[10px] px-2 py-1 rounded truncate transition-colors ${
                selectedFolder === f.name
                  ? "bg-green-900/40 text-green-400"
                  : "text-green-700 hover:text-green-400 hover:bg-green-950/30"
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="truncate">{f.name}</span>
                <span className="text-green-900 text-[8px] ml-1">{f.recording_count}</span>
              </div>
              <div className="text-[8px] text-green-900">
                {formatSize(f.size_bytes)}
              </div>
            </button>
          ))}
          {folders.length === 0 && (
            <div className="text-[9px] text-green-900 text-center py-4">
              No folders yet
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-[#0b100b] text-green-800 z-10">
              <tr>
                <th className="px-2 py-1.5 text-left">{"\u2605"}</th>
                <th className="px-2 py-1.5 text-left">DATE</th>
                <th className="px-2 py-1.5 text-left">FREQ</th>
                <th className="px-2 py-1.5 text-left">PROTOCOL</th>
                <th className="px-2 py-1.5 text-left">DECODER</th>
                <th className="px-2 py-1.5 text-right">DUR</th>
                <th className="px-2 py-1.5 text-right">SIZE</th>
                <th className="px-2 py-1.5 text-right">DEC</th>
                <th className="px-2 py-1.5 text-center">FILES</th>
                <th className="px-2 py-1.5 text-right">WRD</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => selectRecord(r)}
                  className={`cursor-pointer border-b border-green-900/10 hover:bg-green-950/30 ${
                    selectedRecord?.id === r.id ? "bg-green-950/50" : ""
                  }`}
                >
                  <td className="px-2 py-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleStar(r.id)
                      }}
                      className={r.starred ? "text-yellow-400" : "text-green-900"}
                    >
                      {r.starred ? "\u2605" : "\u2606"}
                    </button>
                  </td>
                  <td className="px-2 py-1 text-green-700">{formatDate(r.timestamp)}</td>
                  <td className="px-2 py-1 text-green-400 font-bold">
                    {r.freq_label || `${(r.freq_hz / 1e6).toFixed(3)}`}
                  </td>
                  <td className="px-2 py-1 text-cyan-400">{r.protocol}</td>
                  <td className="px-2 py-1 text-green-700">{r.decoder_used}</td>
                  <td className="px-2 py-1 text-right text-green-700">
                    {fmtDuration(r.duration_seconds)}
                  </td>
                  <td className="px-2 py-1 text-right text-green-700">
                    {formatSize(r.file_size_bytes)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {r.decode_count > 0 ? (
                      <span className="text-green-400">{r.decode_count}</span>
                    ) : (
                      <span className="text-green-900">0</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-green-800" title=".raw">R</span>
                      {r.json_path && <span className="text-cyan-800" title=".json">J</span>}
                      {hasWav(r) && <span className="text-yellow-800" title=".wav">W</span>}
                    </div>
                  </td>
                  <td className="px-2 py-1 text-right">
                    <WeirdBar score={r.weirdness_score} />
                  </td>
                </tr>
              ))}
              {filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-green-900">
                    No records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        {selectedRecord && (
          <div className="w-80 border-l border-green-900/30 overflow-y-auto p-3 space-y-3 flex-shrink-0 bg-[#0b100b]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-green-400 font-mono">
                {selectedRecord.freq_label || `${(selectedRecord.freq_hz / 1e6).toFixed(3)} MHz`}
              </h3>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-green-800 hover:text-green-400 text-xs font-bold"
              >
                [X]
              </button>
            </div>

            <div className="space-y-1 text-[10px]">
              <DetailRow label="BAND" value={selectedRecord.band_name} />
              <DetailRow label="PROTOCOL" value={selectedRecord.protocol} vc="text-cyan-400" />
              <DetailRow label="CATEGORY" value={selectedRecord.category} />
              <DetailRow label="DECODER" value={selectedRecord.decoder_used} />
              <DetailRow label="DURATION" value={fmtDuration(selectedRecord.duration_seconds)} />
              <DetailRow label="SIZE" value={formatSize(selectedRecord.file_size_bytes)} />
              <DetailRow label="DECODE" value={selectedRecord.decode_count} />
              <DetailRow label="WEIRDNESS" value={selectedRecord.weirdness_score} />
              {selectedRecord.re_decoded && (
                <DetailRow label="RE-DECODED" value="YES" vc="text-yellow-400" />
              )}
            </div>

            {/* File download + audio buttons */}
            <div className="space-y-1">
              <div className="text-[9px] text-green-800 uppercase tracking-wider font-bold">
                Files
              </div>
              <div className="flex flex-wrap gap-1.5">
                <a
                  href={`${API_BASE}/api/history/${selectedRecord.id}/raw`}
                  download
                  className="text-[9px] px-2 py-0.5 rounded border border-green-900/50 hover:border-cyan-700 text-cyan-600 inline-flex items-center gap-1"
                >
                  DL .RAW
                </a>
                <a
                  href={`${API_BASE}/api/history/${selectedRecord.id}/json`}
                  download
                  className="text-[9px] px-2 py-0.5 rounded border border-green-900/50 hover:border-cyan-700 text-cyan-600 inline-flex items-center gap-1"
                >
                  DL .JSON
                </a>
                {hasWav(selectedRecord) && (
                  <>
                    <a
                      href={`${API_BASE}/api/history/${selectedRecord.id}/wav`}
                      download
                      className="text-[9px] px-2 py-0.5 rounded border border-green-900/50 hover:border-yellow-700 text-yellow-600 inline-flex items-center gap-1"
                    >
                      DL .WAV
                    </a>
                    <button
                      onClick={() => playAudio(selectedRecord.id)}
                      className={`text-[9px] px-2 py-0.5 rounded border ${
                        playingAudio === selectedRecord.id
                          ? "border-red-700 text-red-400 bg-red-950/30"
                          : "border-green-900/50 hover:border-green-600 text-green-600"
                      }`}
                    >
                      {playingAudio === selectedRecord.id ? "\u23F9 STOP" : "\u25B6 PLAY"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Audio player visual */}
            {playingAudio === selectedRecord.id && (
              <div className="text-[9px] text-green-500 bg-[#060a06] rounded px-2 py-1 border border-green-900/20 animate-pulse">
                Playing audio...
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => toggleStar(selectedRecord.id)}
                className="text-[9px] px-2 py-0.5 rounded border border-green-900/50 hover:border-yellow-700 text-green-700"
              >
                {selectedRecord.starred ? "\u2605 UNSTAR" : "\u2606 STAR"}
              </button>
              <button
                onClick={() => setEditingNote(selectedRecord.id)}
                className="text-[9px] px-2 py-0.5 rounded border border-green-900/50 hover:border-green-600 text-green-700"
              >
                NOTE
              </button>
              <button
                onClick={() => deleteRecord(selectedRecord.id)}
                className="text-[9px] px-2 py-0.5 rounded border border-green-900/50 hover:border-red-700 text-red-800"
              >
                DELETE
              </button>
            </div>

            {/* Note editor */}
            {editingNote === selectedRecord.id && (
              <div className="space-y-1">
                <textarea
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  rows={3}
                  className="w-full bg-[#060a06] border border-green-900/50 rounded px-2 py-1 text-[10px] text-green-400 resize-none font-mono"
                  placeholder="Add note..."
                />
                <div className="flex gap-1">
                  <button
                    onClick={() => saveNote(selectedRecord.id)}
                    className="text-[9px] px-2 py-0.5 bg-green-950 rounded text-green-400 border border-green-900/50"
                  >
                    SAVE
                  </button>
                  <button
                    onClick={() => setEditingNote(null)}
                    className="text-[9px] px-2 py-0.5 text-green-800"
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            )}
            {selectedRecord.notes && editingNote !== selectedRecord.id && (
              <div className="text-[9px] text-green-600 bg-[#060a06] rounded px-2 py-1 border border-green-900/20">
                {selectedRecord.notes}
              </div>
            )}

            {/* Re-decode */}
            <div className="space-y-1">
              <div className="text-[9px] text-green-800 uppercase tracking-wider font-bold">
                Re-Decode
              </div>
              <div className="flex items-center gap-1">
                <select
                  value={reDecodeDecoder}
                  onChange={(e) => setReDecodeDecoder(e.target.value)}
                  className="bg-[#060a06] border border-green-900/50 text-[9px] text-green-400 rounded px-1 py-0.5 flex-1 font-mono"
                >
                  <option value="">AUTO</option>
                  {DECODERS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => reDecode(selectedRecord.id)}
                  className="text-[9px] px-2 py-0.5 bg-green-950 rounded text-green-400 border border-green-900/50"
                >
                  RE-DECODE
                </button>
              </div>
            </div>

            {/* Decode result JSON */}
            {detailJson && (
              <div className="space-y-1">
                <div className="text-[9px] text-green-800 uppercase tracking-wider font-bold">
                  Decode Result
                </div>
                {detailJson.error && (
                  <div className="text-[9px] text-yellow-400 bg-yellow-950/20 rounded px-2 py-1 border border-yellow-900/30">
                    {detailJson.error}
                  </div>
                )}
                {detailJson.items && detailJson.items.length > 0 && (
                  <div className="space-y-0.5 max-h-48 overflow-y-auto">
                    {detailJson.items.slice(0, 20).map((item, i) => (
                      <div
                        key={i}
                        className="text-[9px] text-green-500 bg-[#060a06] rounded px-2 py-1 break-all font-mono border border-green-900/10"
                      >
                        {typeof item === "string"
                          ? item
                          : typeof item === "object" && item.data
                          ? JSON.stringify(item.data, null, 1)
                          : JSON.stringify(item)}
                      </div>
                    ))}
                    {detailJson.items.length > 20 && (
                      <div className="text-[9px] text-green-900">
                        +{detailJson.items.length - 20} more...
                      </div>
                    )}
                  </div>
                )}
                {detailJson._summary && (
                  <div className="text-[9px] text-green-400">{detailJson._summary}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-green-900/40 text-[10px] shrink-0">
        <div className="flex items-center gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            className="px-2 py-0.5 border border-green-900/50 rounded disabled:opacity-30 text-green-700 hover:text-green-400"
          >
            PREV
          </button>
          <span className="text-green-800 font-mono">
            {page + 1} / {Math.max(1, totalPages)}
          </span>
          <button
            disabled={page + 1 >= totalPages}
            onClick={() => setPage(page + 1)}
            className="px-2 py-0.5 border border-green-900/50 rounded disabled:opacity-30 text-green-700 hover:text-green-400"
          >
            NEXT
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-[9px] ${
              diskPct > 90
                ? "text-red-400"
                : diskPct > 70
                ? "text-yellow-400"
                : "text-green-700"
            }`}
          >
            DISK: {diskUsedGb.toFixed(1)} / {maxDiskGb} GB
          </span>
          <div className="w-16 h-1.5 bg-[#060a06] rounded overflow-hidden border border-green-900/30">
            <div
              className={`h-full rounded ${
                diskPct > 90
                  ? "bg-red-500"
                  : diskPct > 70
                  ? "bg-yellow-500"
                  : "bg-green-600"
              }`}
              style={{ width: `${diskPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value, vc = "text-green-500" }) {
  return (
    <div className="flex justify-between">
      <span className="text-green-800">{label}</span>
      <span className={`font-mono ${vc}`}>{value ?? "\u2014"}</span>
    </div>
  )
}

function WeirdBar({ score }) {
  if (!score && score !== 0) return <span className="text-green-900">{"\u2014"}</span>
  const color =
    score >= 70
      ? "bg-red-500"
      : score >= 40
      ? "bg-yellow-500"
      : "bg-green-600"
  return (
    <div className="flex items-center gap-1">
      <div className="w-8 h-1.5 bg-[#060a06] rounded overflow-hidden">
        <div className={`h-full rounded ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-green-700 w-5 text-right">{score}</span>
    </div>
  )
}
