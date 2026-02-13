# SIGINT RADAR

Open-source RTL-SDR signal intelligence dashboard. MIT license.

## Stack
Backend: Python 3.11 / asyncio / websockets / pyrtlsdr / numpy / scipy / SQLAlchemy / aiohttp
Frontend: React 18 / Vite / Tailwind CSS / Canvas / Three.js / Leaflet
Infra: Docker Compose / SQLite / GitHub Actions
Decoders: rtl_433, readsb, multimon-ng, SatDump CLI, dumpvdl2, Direwolf

## Dev Rules
- Docker-first: `docker compose up --build` for every change
- Git: `faz/N-name` branches, conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`)
- Code comments English, UI strings via i18n
- Produce files, minimize commentary
- Every external call (USB, subprocess, disk, network) has try/except
- No hardcoded coords/country frequencies — config.yaml + region profiles
- After each phase: verify → commit → push → merge to main

## Architecture
```
Browser:3000 ←WebSocket→ Python:8765 ←→ RTL-SDR USB
                          Python:8080 ←→ REST API
                          SQLite + data/captures/
```
Two containers: sigint-backend (Python+decoders), sigint-frontend (Node+Vite).
Single dongle = one freq at a time. Scan = sequential band hop. Record = pause scan.

## Files
```
sigint-radar/
├── docker-compose.yml
├── config.yaml
├── .env
├── CLAUDE.md
├── LICENSE (MIT)
├── README.md
├── CONTRIBUTING.md
├── .github/workflows/build.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt          # pyrtlsdr numpy scipy websockets aiohttp sqlalchemy pyyaml requests reverse_geocode
│   ├── main.py                   # WS server + router
│   ├── config.py                 # YAML loader
│   ├── scan_engine.py            # Band scanning
│   ├── signal_detector.py        # FFT detection
│   ├── signal_cluster.py         # Grouping + TTL
│   ├── decoder_manager.py        # Live decode
│   ├── decode_normalizer.py      # Unified output
│   ├── decode_runner.py          # IQ→decode
│   ├── recorder.py               # IQ capture
│   ├── database.py               # SQLAlchemy
│   ├── weirdness_scorer.py
│   ├── distance_estimator.py     # FSPL
│   ├── rest_api.py               # aiohttp
│   └── regions/
│       ├── __init__.py            # detect_region(), load_bands()
│       ├── base.py eu.py us.py tr.py jp.py au.py
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── i18n/{en,tr}.json
│       ├── components/
│       │   ├── SetupWizard.jsx RadarScreen.jsx BandCatalog.jsx
│       │   ├── SignalList.jsx SignalDetail.jsx RecordControl.jsx
│       │   ├── DecodePanel.jsx DecodeHistory.jsx
│       │   ├── WaterfallDisplay.jsx GlobeView.jsx MapView.jsx
│       │   ├── WeirdnessAlert.jsx Settings.jsx
│       ├── hooks/useWebSocket.js useSignalData.js
│       └── utils/signalClassifier.js colorMapper.js fsplCalculator.js
└── data/ (volume)
    ├── signals.db
    └── captures/
```

## config.yaml Template
```yaml
rtlsdr: {device_index: 0, sample_rate: 2400000, gain: 40, bias_tee: false, ppm_correction: 0}
station: {lat: 0.0, lon: 0.0, name: "", altitude_m: 0, location_source: config}
region: {profile: auto}
scanner: {enabled: true, fake_mode: false, cycle_delay_ms: 500, fft_size: 2048, fft_averages: 16, signal_threshold_db: 10}
bands:
  fm_broadcast: {enabled: true, priority: low}
  aviation: {enabled: true, priority: high}
  ism_433: {enabled: true, priority: high, decoder: rtl_433}
  ism_868: {enabled: true, priority: high, decoder: rtl_433}
  ism_915: {enabled: false, priority: high, decoder: rtl_433}
  adsb: {enabled: true, priority: high, decoder: readsb}
  tetra: {enabled: true, priority: medium}
  p25: {enabled: false, priority: medium}
  weather_sat: {enabled: true, priority: medium, decoder: satdump}
  radiosonde: {enabled: true, priority: medium}
  marine: {enabled: true, priority: low}
  pager: {enabled: true, priority: medium, decoder: multimon-ng}
  pmr446: {enabled: true, priority: low}
  frs_gmrs: {enabled: false, priority: low}
  amateur_2m: {enabled: true, priority: low}
  amateur_70cm: {enabled: true, priority: low}
  gsm900: {enabled: true, priority: low}
  lband_sat: {enabled: false, priority: low}
priority_bands: [ism_433, ism_868]
aircraft: {source: api, api_url: "https://opensky-network.org/api/states/all", api_refresh_seconds: 10, api_radius_km: 200}
decoders:
  rtl_433: {output_format: json, protocols: all}
  readsb: {max_range: 400}
  multimon_ng: {protocols: [POCSAG512, POCSAG1200, POCSAG2400, FLEX]}
  satdump: {mode: cli}
websocket: {host: 0.0.0.0, port: 8765}
rest_api: {host: 0.0.0.0, port: 8080}
database: {path: /app/data/signals.db, retention_days: 30}
recording: {max_duration_seconds: 60, captures_dir: /app/data/captures, auto_decode: true, max_disk_usage_gb: 10, keep_raw_after_decode: true}
alerts: {weirdness_threshold: 40, sound: true, desktop_notification: true}
ui: {theme: dark, language: en, radar_range_km: 200, waterfall_history_seconds: 60, globe_visible: true}
setup_complete: false
```

## SQLite Schema
```sql
CREATE TABLE signals (id INTEGER PRIMARY KEY, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  freq_hz REAL, power_db REAL, snr_db REAL, protocol TEXT, category TEXT, band_name TEXT,
  estimated_distance_km REAL, weirdness_score INTEGER, decode_summary TEXT);

CREATE TABLE decode_history (id INTEGER PRIMARY KEY, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  freq_hz REAL, freq_label TEXT, band_name TEXT, protocol TEXT, category TEXT, decoder_used TEXT,
  duration_seconds REAL, file_size_bytes INTEGER, raw_path TEXT, json_path TEXT,
  decode_result TEXT, decode_count INTEGER, power_db REAL, estimated_distance_km REAL,
  weirdness_score INTEGER, starred BOOLEAN DEFAULT 0, notes TEXT, re_decoded BOOLEAN DEFAULT 0);
```

## WebSocket Protocol
```
Frontend→Backend:
  scan_start{bands[]} scan_stop
  record_start{freq_hz,duration_seconds,band_name,protocol_hint,auto_decode} record_stop
  get_decode_history{limit,offset,category,starred_only,freq_min,freq_max,search_text,date_from,date_to}
  re_decode{record_id,decoder_override} toggle_star{record_id} add_note{record_id,note}
  delete_record{record_id,delete_files} update_config{section,values}
  save_setup{station,region,rtlsdr,language} get_rtlsdr_status
  replay_start{record_id,speed} replay_stop

Backend→Frontend:
  connection_status{rtlsdr_connected,station,region} rtlsdr_status{connected,message}
  scan_band_active{band,index,total} signal_new{signal} signal_update{signal} signal_removed{signal_id}
  scan_stopped scan_paused{reason} scan_resumed
  record_progress{freq_hz,elapsed_seconds,file_size_mb,max_seconds} record_complete{record_id,raw_path,duration_seconds}
  decode_complete{record_id,decoder,protocol,decode_count,result}
  decode_history{total,disk_usage_bytes,records[]}
  spectrum{band,freqs[],power_db[]} alert{signal,weirdness,reason}
  replay_progress{elapsed,total} replay_complete{record_id} error{action,message}
```

## REST API
```
GET  /api/status /api/signals /api/signals/:id
GET  /api/history /api/history/:id /api/history/:id/raw /api/history/:id/json
GET  /api/bands /api/config
POST /api/scan/start{bands[]} /api/scan/stop /api/record{freq_hz,duration_seconds}
```

## Normalized Decode Schema (all decoders output this)
```json
{"decoder":"rtl_433","protocol":"Bresser-5in1","category":"weather_station",
 "items":[{"timestamp":"","type":"packet","data":{},"raw_text":null}],
 "count":5,"error":null}
```
type: packet(rtl_433) message(multimon-ng) file(satdump) frame(readsb)

## Reference Tables

### FSPL
```python
def estimate_distance_km(freq_mhz, rx_dbm, tx_dbm):
    return max(0.1, min(10**((tx_dbm-rx_dbm-20*math.log10(freq_mhz)-32.44)/20), 800))

TX_POWER = {"fm_broadcast":60,"tetra":40,"gsm_bts":43,"pmr446":10,"ism_433":0,
  "ism_868":7,"lora":14,"adsb":20,"radiosonde":20,"pocsag":30,"marine_vhf":25}
```

### TTL (seconds)
```python
TTL = {"aircraft":30,"satellite":120,"weather_station":60,"ism_sensor":60,
  "pager":30,"pmr":15,"tetra":15,"fm_broadcast":120,"unknown":45,"default":30}
```

### Band Sample Rates (rate, sweep_count)
```python
BAND_SR = {"fm_broadcast":(2.4e6,9),"aviation":(2.4e6,5),"weather_sat":(2.4e6,1),
  "ism_433":(2.4e6,1),"ism_868":(2.4e6,2),"ism_915":(2.4e6,11),"adsb":(2.4e6,1),
  "tetra":(2.4e6,9),"pmr446":(1e6,1),"pager":(2.4e6,9),"marine":(2.4e6,3),
  "radiosonde":(2.4e6,3),"lband_sat":(2.4e6,9),"gsm900":(2.4e6,11)}
```

### Decoder Selection
```python
DECODERS = [(432e6,435e6,"rtl_433"),(866e6,870e6,"rtl_433"),(912e6,918e6,"rtl_433"),
  (136e6,138e6,"satdump"),(1088e6,1092e6,"readsb"),(148e6,175e6,"multimon-ng"),
  (440e6,470e6,"multimon-ng"),(928e6,930e6,"multimon-ng")]
```

### Weirdness
```python
def weirdness(sig, priority_bands):
    s=0
    if sig.protocol=="unknown": s+=50
    if sig.band in priority_bands: s+=30
    if abs(sig.power-expected)>20: s+=25
    if sig.seen_once: s+=20
    if 0<=sig.hour<6: s+=15
    if sig.duration<1: s+=10
    return min(s,100)
```

### Regions
| Region | ISM Low | ISM High | PMR/FRS | Trunked | Pager |
|--------|---------|----------|---------|---------|-------|
| EU/TR | 433 | 868 | PMR446 | TETRA 380-400 | POCSAG 450-470 |
| US/CA | 315 | 915 | FRS/GMRS 462/467 | P25 700/800 | FLEX 929 |
| JP | 315/426 | 920 | — | — | 280 |
| AU/NZ | 433 | 915 | UHF CB 476 | P25 | — |

### Radar Display
- Rings: 20/40/60km, sweep synced to scanner, labels N/NE/E/SE/S/SW/W/NW
- ✈blue=aircraft 🛰cyan=satellite ●red=SCADA ●green=ISM ●yellow=radio ●orange=pager ●white=FM
- High weirdness: blink+enlarge. TTL fade: opacity=ttl/max_ttl. Cluster: freq±5kHz+same protocol→1 dot

### Errors
- No RTL-SDR → status:disconnected, disable scan, retry 5s
- USB loss during record → save partial, attempt decode, warn
- Decoder missing → error JSON, try alt, keep raw
- Decoder timeout → kill 30s, error, retry button
- Disk full → warn banner, auto-delete oldest non-starred
- WS disconnect → exponential backoff 1s→30s
- DB locked → WAL mode, 3 retries
