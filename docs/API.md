# SIGINT RADAR REST API

Base URL: `http://localhost:8080`

All responses are JSON. CORS is enabled for all origins.

## Endpoints

### GET /api/status

System status overview.

**Response:**
```json
{
  "rtlsdr_connected": true,
  "scanning": true,
  "active_band": "ism_433",
  "signal_count": 12,
  "uptime_seconds": 3600.5,
  "recording": false,
  "region": "TR",
  "station": "My Station"
}
```

### GET /api/signals

All currently active signals (live cluster data).

**Response:**
```json
[
  {
    "id": "sig_433920000_1234",
    "freq_hz": 433920000,
    "band_name": "ism_433",
    "protocol": "rtl_433",
    "category": "ism_sensor",
    "power_db": -45.2,
    "snr_db": 18.5,
    "estimated_distance_km": 2.3,
    "weirdness_score": 15,
    "count": 5,
    "ttl": 25,
    "max_ttl": 30
  }
]
```

### GET /api/signals/:id

Single signal by cluster ID.

**Response:** Same as individual item from `/api/signals`.

### GET /api/history

Decode history with filtering.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| limit | int | 50 | Max records |
| offset | int | 0 | Pagination offset |
| category | string | - | Filter by category |
| starred | bool | false | Starred only |
| freq_min | float | - | Min frequency Hz |
| freq_max | float | - | Max frequency Hz |

**Response:**
```json
{
  "records": [...],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

### GET /api/history/:id

Single decode record with full details.

### GET /api/history/:id/raw

Download raw IQ file (`.raw`). Returns `application/octet-stream`.

### GET /api/history/:id/json

Download decode result JSON.

### GET /api/bands

Band catalog with current scan status.

**Response:**
```json
{
  "bands": [
    {
      "name": "ism_433",
      "description": "ISM 433 MHz",
      "category": "ism_sensor",
      "priority": "high",
      "enabled": true,
      "center_mhz": 433.92,
      "bandwidth_mhz": 2.0
    }
  ],
  "band_status": {
    "ism_433": "found",
    "aviation": "scanning"
  }
}
```

### GET /api/config

Current configuration (sensitive fields filtered).

### GET /api/spectrum

Latest spectrum data (for waterfall display).

**Response:**
```json
{
  "band": "ism_433",
  "center_hz": 433920000,
  "sample_rate": 2400000,
  "freqs": [432720000, ...],
  "power_db": [-85.2, ...]
}
```

### POST /api/scan/start

Start scanning.

**Body:**
```json
{
  "bands": ["ism_433", "aviation"]
}
```
If `bands` is empty, scans all enabled bands.

### POST /api/scan/stop

Stop scanning.

### POST /api/record

Start recording at a frequency.

**Body:**
```json
{
  "freq_hz": 433920000,
  "duration_seconds": 15
}
```

## WebSocket

Connect to `ws://localhost:8765` for real-time updates.

### Message types (server -> client):
- `connection_status` - Initial state
- `signal_new` - New signal detected
- `signal_update` - Signal updated
- `signal_removed` - Signal expired
- `spectrum` - FFT spectrum data
- `decode_line` - Live decode result
- `record_started/progress/complete/error` - Recording lifecycle
- `replay_started/progress/complete` - IQ replay lifecycle
- `alert` - Weirdness threshold exceeded
- `config_updated` - Config changed
- `band_status_update` - Scan status change

### Message types (client -> server):
- `scan_start` - Start scan with bands
- `scan_stop` - Stop scan
- `record_start` - Start recording
- `record_stop` - Stop recording
- `replay_start` - Replay IQ file
- `replay_stop` - Stop replay
- `update_config` - Update configuration
- `get_decode_history` - Fetch history
- `toggle_star` / `add_note` / `delete_record` - History actions
