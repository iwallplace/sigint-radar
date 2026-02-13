# SIGINT RADAR

Open-source RTL-SDR signal intelligence dashboard. Scan, decode, and visualize radio signals in real-time with PPI radar, waterfall, map, and 3D globe displays.

## Features

- PPI radar display with clustered signals
- Waterfall spectrum display (Canvas, color-mapped power)
- Interactive map (Leaflet, dark tiles, distance circles)
- 3D globe view (Three.js, station pin, aircraft positions)
- Multi-band scanning with priority scheduling
- Live decode: rtl_433, multimon-ng, readsb, satdump, dumpvdl2, direwolf
- IQ recording with auto-decode pipeline
- IQ replay with spectrum visualization
- Aircraft tracking via OpenSky API
- Decode history with search, filter, star, notes
- REST API on port 8080 (see [docs/API.md](docs/API.md))
- Setup wizard with map-based location picker
- Region profiles: EU, US, TR, JP, AU
- Internationalization: English, Turkish
- Weirdness scoring with alert notifications
- Docker-based deployment (Linux native + macOS via rtl_tcp)

## Hardware

- **RTL-SDR dongle** (RTL2832U) or compatible
- Broadband antenna (discone recommended)
- USB passthrough (Linux) or rtl_tcp network access (macOS)

---

## Installation

### Linux (Docker — Native USB)

**Prerequisites:**
```bash
# Blacklist DVB drivers (required for RTL-SDR)
sudo tee /etc/modprobe.d/blacklist-dvb.conf << 'EOF'
blacklist dvb_usb_rtl28xxu
blacklist rtl2832
blacklist rtl2830
EOF
sudo modprobe -r dvb_usb_rtl28xxu 2>/dev/null
```

**Install & Run:**
```bash
git clone https://github.com/iwallplace/sigint-radar.git
cd sigint-radar
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) in your browser. That's it.

The RTL-SDR dongle is passed through to the container via USB. Plug it in before starting.

---

### macOS (Docker + rtl_tcp)

macOS cannot pass USB devices directly to Docker. We use `rtl_tcp` to bridge the SDR over the network.

**Step 1 — Install librtlsdr:**
```bash
brew install librtlsdr
```

**Step 2 — Start rtl_tcp (separate terminal):**
```bash
rtl_tcp -a 0.0.0.0 -p 1234
```
Keep this terminal open. You should see `Listening on 0.0.0.0:1234`.

**Step 3 — Configure config.yaml:**
```bash
git clone https://github.com/iwallplace/sigint-radar.git
cd sigint-radar
```

Edit `config.yaml` and set the RTL-SDR source to `rtl_tcp`:
```yaml
rtlsdr:
  source: rtl_tcp
  rtl_tcp_host: host.docker.internal
  rtl_tcp_port: 1234
  gain: 40
  ppm_correction: 0
  bias_tee: false
```

**Step 4 — Start Docker:**
```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### Demo Mode (No SDR Required)

To try SIGINT RADAR without hardware, enable fake mode in `config.yaml`:
```yaml
scanner:
  fake_mode: true
```
This generates synthetic signals for testing.

---

## Quick Start Script

A `start.sh` script is included that detects your OS and guides you:

```bash
chmod +x start.sh
./start.sh
```

- **Linux:** Checks for Docker, blacklists DVB drivers, starts containers.
- **macOS:** Checks for `rtl_tcp`, reminds you to start it, configures `rtl_tcp` mode, starts containers.

---

## Supported Regions

| Region | Bands |
|--------|-------|
| EU | ISM 433/868, PMR446, TETRA 380-400, POCSAG, GSM 900 |
| US | ISM 915, FRS/GMRS, P25, FLEX Pager, Cellular 850 |
| TR | ISM 433/868, PMR446, TETRA 380-400/410-430, POCSAG, GSM 900 |
| JP | ISM 315/426/920, POCSAG 278-282, Cellular 800 |
| AU | ISM 433/915, UHF CB 476, P25, POCSAG 148, GSM 900 |

Universal bands (all regions): FM Broadcast, Aviation, Weather Satellite, Amateur 2m/70cm, Marine VHF, Radiosonde, ADS-B, L-Band Satellite.

## Architecture

```
frontend/     React 18 + Vite + Tailwind CSS 4
backend/      Python 3.11 + asyncio + websockets + aiohttp
  regions/    Region-specific frequency profiles
  decoders    rtl_433, multimon-ng, readsb, satdump, dumpvdl2, direwolf
docs/         API documentation
```

### Ports

| Port | Service |
|------|---------|
| 3000 | Frontend (Vite dev server) |
| 8765 | WebSocket (real-time signals) |
| 8080 | REST API (see [docs/API.md](docs/API.md)) |

## REST API

Full API documentation: [docs/API.md](docs/API.md)

```bash
# System status
curl http://localhost:8080/api/status

# Active signals
curl http://localhost:8080/api/signals

# Decode history
curl http://localhost:8080/api/history?limit=10

# Band catalog
curl http://localhost:8080/api/bands

# Start scan
curl -X POST http://localhost:8080/api/scan/start -H 'Content-Type: application/json' -d '{"bands":["ism_433","aviation"]}'
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on submitting PRs, adding region profiles, and translations.

## License

MIT
