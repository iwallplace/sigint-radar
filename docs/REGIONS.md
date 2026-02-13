# Adding a Region Profile

This guide explains how to add a new regulatory region to SIGINT RADAR.

## File Structure

Each region is a Python module in `backend/regions/`:

```
backend/regions/
  __init__.py   # Region map and band loader
  base.py       # Universal bands (all regions)
  eu.py         # European bands
  us.py         # US/CA bands
  tr.py         # Turkey bands
  jp.py         # Japan bands
  au.py         # Australia bands
```

## Band Definition

Each band is a dictionary with these required fields:

```python
"band_name": {
    "center_hz": 433_920_000,      # Center frequency in Hz
    "bandwidth_hz": 1_740_000,     # Scan bandwidth in Hz
    "dwell_seconds": 3,            # Time to dwell on this band
    "decoder": "rtl_433",          # Decoder: rtl_433, multimon-ng, readsb, satdump, or None
    "tx_power_dbm": 0,             # Typical transmit power (for distance estimation)
    "description": "ISM 433 MHz",  # Human-readable description
    "category": "ism_sensor",      # Category for UI grouping
    "priority": "high",            # Scan priority: high, medium, low
}
```

### Categories

- `ism_sensor` - ISM band sensors (weather, home automation)
- `weather_station` - Weather stations and radiosondes
- `pager` - POCSAG/FLEX pager systems
- `aircraft` - Aviation and ADS-B
- `satellite` - Weather and communication satellites
- `tetra` - TETRA/P25 trunked radio
- `radio` - Amateur, PMR, FRS/GMRS
- `marine` - Marine VHF
- `fm_broadcast` - FM radio broadcast
- `unknown` - Uncategorized

## Step-by-Step

### 1. Create the region file

Create `backend/regions/XX.py`:

```python
"""XX region-specific frequency bands."""

XX_BANDS = {
    "ism_433": {
        "center_hz": 433_920_000,
        "bandwidth_hz": 1_740_000,
        "dwell_seconds": 3,
        "decoder": "rtl_433",
        "tx_power_dbm": 0,
        "description": "ISM 433 MHz (XX)",
        "category": "ism_sensor",
        "priority": "high",
    },
    # Add more bands...
}
```

### 2. Register in __init__.py

```python
from .xx import XX_BANDS

# Add country codes
REGION_MAP = {
    ...
    "XX": "xx",
}

# Add bands
REGION_BANDS = {
    ...
    "xx": XX_BANDS,
}

# Add label
REGION_LABELS = {
    ...
    "xx": "Country Name (XX)",
}
```

### 3. Add to Setup Wizard

In `frontend/src/components/SetupWizard.jsx`, add to `REGION_OPTIONS`:

```javascript
{ value: "xx", label: "Country Name (XX)" },
```

### 4. Test

```bash
docker compose up --build
```

Verify the region appears in the Setup Wizard and loads correct bands.
