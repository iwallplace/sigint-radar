# SIGINT RADAR

Open-source RTL-SDR signal intelligence dashboard. Scan, decode, and visualize radio signals in real-time with a PPI radar display.

![screenshot](docs/screenshot-placeholder.png)

## Quick Start

```bash
git clone https://github.com/yourusername/sigint-radar.git
cd sigint-radar
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Hardware

- **RTL-SDR dongle** (RTL2832U) or compatible
- Broadband antenna (discone recommended)
- USB passthrough or rtl_tcp network access

## Features

- PPI radar display with clustered signals
- Multi-band scanning with priority scheduling
- Live decode: rtl_433, multimon-ng, readsb, satdump
- IQ recording with auto-decode pipeline
- Decode history with search, filter, star, notes
- Setup wizard with map-based location picker
- Region profiles: EU, US, TR, JP, AU
- Internationalization: English, Turkish
- Docker-based deployment

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
backend/      Python 3.11 + asyncio + websockets
  regions/    Region-specific frequency profiles
  decoders    rtl_433, multimon-ng, readsb, satdump
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on submitting PRs, adding region profiles, and translations.

## License

MIT
