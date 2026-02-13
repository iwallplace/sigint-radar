"""Normalize decoder outputs to unified schema.

Output format:
{
    "decoder": "rtl_433",
    "protocol": "Bresser-5in1",
    "category": "weather_station",
    "items": [{"timestamp": "", "type": "packet", "data": {}, "raw_text": null}],
    "count": 5,
    "error": null
}
"""

import json
import logging
import re
from datetime import datetime

logger = logging.getLogger("sigint-radar")

# rtl_433 model → category mapping
MODEL_CATEGORY = {
    "Bresser-5in1": "weather_station",
    "Bresser-6in1": "weather_station",
    "Bresser-3CH": "weather_station",
    "Acurite": "weather_station",
    "LaCrosse": "weather_station",
    "Oregon": "weather_station",
    "Prologue": "weather_station",
    "Nexus": "weather_station",
    "Fine-Offset": "weather_station",
    "Intertechno": "ism_sensor",
    "Generic-Remote": "ism_sensor",
    "Honeywell": "ism_sensor",
    "DSC-Security": "ism_sensor",
}


def normalize_rtl433(json_lines):
    """Normalize rtl_433 JSON output lines."""
    items = []
    protocol = "unknown"
    category = "ism_sensor"

    for line in json_lines:
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
            model = data.get("model", "unknown")
            if model != "unknown":
                protocol = model
                category = MODEL_CATEGORY.get(model, "ism_sensor")

            items.append({
                "timestamp": data.get("time", datetime.utcnow().isoformat()),
                "type": "packet",
                "data": data,
                "raw_text": None,
            })
        except json.JSONDecodeError:
            continue

    return {
        "decoder": "rtl_433",
        "protocol": protocol,
        "category": category,
        "items": items,
        "count": len(items),
        "error": None,
    }


def normalize_multimon(text_lines):
    """Normalize multimon-ng text output lines."""
    items = []
    protocol = "POCSAG"

    for line in text_lines:
        line = line.strip()
        if not line:
            continue

        if "POCSAG" in line:
            protocol = "POCSAG"
        elif "FLEX" in line:
            protocol = "FLEX"

        items.append({
            "timestamp": datetime.utcnow().isoformat(),
            "type": "message",
            "data": {"text": line},
            "raw_text": line,
        })

    return {
        "decoder": "multimon-ng",
        "protocol": protocol,
        "category": "pager",
        "items": items,
        "count": len(items),
        "error": None,
    }


def normalize_readsb(hex_lines):
    """Normalize readsb hex output lines."""
    items = []

    for line in hex_lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        items.append({
            "timestamp": datetime.utcnow().isoformat(),
            "type": "frame",
            "data": {"hex": line},
            "raw_text": None,
        })

    return {
        "decoder": "readsb",
        "protocol": "ADS-B",
        "category": "aircraft",
        "items": items,
        "count": len(items),
        "error": None,
    }


def normalize_satdump(output_dir, files):
    """Normalize SatDump output files."""
    items = []

    for f in files:
        items.append({
            "timestamp": datetime.utcnow().isoformat(),
            "type": "file",
            "data": {"filename": f, "path": f"{output_dir}/{f}"},
            "raw_text": None,
        })

    return {
        "decoder": "satdump",
        "protocol": "NOAA-APT",
        "category": "satellite",
        "items": items,
        "count": len(items),
        "error": None,
    }


def make_decode_summary(normalized):
    """Create a short human-readable summary from normalized decode result."""
    if not normalized or not normalized.get("items"):
        return None

    protocol = normalized.get("protocol", "unknown")
    count = normalized.get("count", 0)
    decoder = normalized.get("decoder", "")

    if decoder == "rtl_433" and normalized["items"]:
        data = normalized["items"][-1].get("data", {})
        parts = [protocol]
        if "temperature_C" in data:
            parts.append(f"T:{data['temperature_C']}\u00b0C")
        if "humidity" in data:
            parts.append(f"H:{data['humidity']}%")
        if "wind_avg_km_h" in data:
            parts.append(f"W:{data['wind_avg_km_h']}km/h")
        if "battery_ok" in data:
            parts.append(f"bat:{'ok' if data['battery_ok'] else 'low'}")
        return " ".join(parts)

    if decoder == "multimon-ng" and normalized["items"]:
        raw = normalized["items"][-1].get("raw_text", "")
        return f"{protocol}: {raw[:60]}" if raw else protocol

    return f"{protocol} x{count}"
