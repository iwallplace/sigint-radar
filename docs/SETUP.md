# Setup Guide

## Prerequisites

- Docker and Docker Compose
- RTL-SDR dongle (or rtl_tcp server)

## Installation

```bash
git clone https://github.com/yourusername/sigint-radar.git
cd sigint-radar
docker compose up --build
```

## First Run

On first launch, the Setup Wizard will guide you through:

1. **Location**: Click the map or enter coordinates. Use "Detect from IP" for automatic location.
2. **Region**: Auto-detected from coordinates. Override manually if needed.
3. **RTL-SDR**: Set gain (0-50 dB), PPM correction, and Bias-T.
4. **Language**: Choose English or Turkish.

Click **START** to save configuration and enter the radar screen.

## RTL-SDR Connection

### USB Direct (Linux host)

Pass the USB device to Docker in `docker-compose.yml`:

```yaml
devices:
  - /dev/bus/usb:/dev/bus/usb
```

### rtl_tcp (macOS / remote)

1. Run `rtl_tcp -a 0.0.0.0` on the host machine
2. Set in `config.yaml`:

```yaml
rtlsdr:
  source: rtl_tcp
  rtl_tcp_host: host.docker.internal
  rtl_tcp_port: 1234
```

## Configuration

Configuration is stored in `/app/config.yaml` (inside Docker volume).

Key settings:

```yaml
station:
  lat: 41.0082
  lon: 28.9784
  name: "My Station"

region:
  profile: tr  # eu, us, tr, jp, au

rtlsdr:
  gain: 40
  ppm_correction: 0
  bias_tee: false

scanner:
  fake_mode: false  # true for demo without SDR

ui:
  language: en  # en, tr

setup_complete: true
```

## Fake Mode (Demo)

For testing without an RTL-SDR:

```yaml
scanner:
  fake_mode: true
```

This generates simulated signals for UI development.
