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

# rtl_433 model → category mapping (prefix match)
MODEL_CATEGORY = {
    "Bresser-5in1": "weather_station",
    "Bresser-6in1": "weather_station",
    "Bresser-3CH": "weather_station",
    "Bresser": "weather_station",
    "Acurite": "weather_station",
    "LaCrosse": "weather_station",
    "LaCrosse-TX141THBv2": "weather_station",
    "Oregon": "weather_station",
    "Oregon-THGR810": "weather_station",
    "Prologue": "weather_station",
    "Prologue-TH": "weather_station",
    "Nexus": "weather_station",
    "Nexus-TH": "weather_station",
    "Fine-Offset": "weather_station",
    "FineOffset-WH65B": "weather_station",
    "Ambient-Weather": "weather_station",
    "TFA-TwinPlus": "weather_station",
    "Hideki-TS04": "weather_station",
    "Kedsum": "weather_station",
    "Intertechno": "ism_sensor",
    "Generic-Remote": "ism_sensor",
    "Honeywell": "ism_sensor",
    "DSC-Security": "ism_sensor",
    "Wireless-Doorbell": "ism_sensor",
    "Maverick": "ism_sensor",
    "TPMS": "automotive",
    "Schrader": "automotive",
    "Citroen": "automotive",
    "Ford": "automotive",
    "Toyota": "automotive",
}


def _match_model_category(model):
    """Match model name to category with prefix matching."""
    if model in MODEL_CATEGORY:
        return MODEL_CATEGORY[model]
    # Try prefix match
    for prefix, cat in MODEL_CATEGORY.items():
        if model.startswith(prefix):
            return cat
    return "ism_sensor"


# Frequency → likely protocol guess for unknown signals
FREQ_PROTOCOL_GUESS = [
    (88e6, 108e6, "FM radyo vericisi olabilir"),
    (118e6, 136e6, "Havacilik telsiz frekansı"),
    (136e6, 138e6, "NOAA uydu sinyali olabilir"),
    (138e6, 139e6, "Meteor M2 uydu sinyali olabilir"),
    (144e6, 148e6, "Amator 2m telsiz"),
    (148e6, 174e6, "VHF telsiz / POCSAG olabilir"),
    (156e6, 162e6, "Denizcilik VHF"),
    (380e6, 400e6, "TETRA kamu telsiz"),
    (400e6, 406e6, "Radyosonde olabilir"),
    (410e6, 430e6, "TETRA ozel telsiz"),
    (430e6, 440e6, "Amator 70cm telsiz"),
    (433e6, 435e6, "ISM 433 MHz sensör / kumanda"),
    (440e6, 470e6, "UHF telsiz / POCSAG pager"),
    (446e6, 446.2e6, "PMR446 lisanssız telsiz"),
    (862e6, 870e6, "ISM 868 MHz LoRa/sensör"),
    (905e6, 928e6, "ISM 915 MHz sensör (US)"),
    (935e6, 960e6, "GSM 900 downlink"),
    (1088e6, 1092e6, "ADS-B uçak transponder"),
    (1525e6, 1559e6, "L-Band uydu"),
]


def guess_protocol_by_freq(freq_hz):
    """Guess likely protocol by frequency for unknown signals."""
    for low, high, desc in FREQ_PROTOCOL_GUESS:
        if low <= freq_hz <= high:
            return desc
    return None


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
                category = _match_model_category(model)

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
    """Normalize multimon-ng text output lines.

    Extracts POCSAG address, function code, and alpha text from output like:
    POCSAG1200: Address: 1234567  Function: 3  Alpha: Some message
    """
    items = []
    protocol = "POCSAG"
    addresses = set()

    pocsag_re = re.compile(
        r"POCSAG(\d+):\s*Address:\s*(\d+)\s*Function:\s*(\d+)\s*(Alpha:\s*(.*)|Numeric:\s*(.*))?",
        re.IGNORECASE,
    )
    flex_re = re.compile(
        r"FLEX[:\s].*?(\d{7,})",
        re.IGNORECASE,
    )

    for line in text_lines:
        line = line.strip()
        if not line:
            continue

        data = {"text": line}

        m = pocsag_re.search(line)
        if m:
            protocol = f"POCSAG{m.group(1)}"
            addr = m.group(2)
            addresses.add(addr)
            data["address"] = addr
            data["function"] = int(m.group(3))
            if m.group(5):
                data["alpha"] = m.group(5).strip()
            elif m.group(6):
                data["numeric"] = m.group(6).strip()
        elif "FLEX" in line:
            protocol = "FLEX"
            fm = flex_re.search(line)
            if fm:
                addresses.add(fm.group(1))
                data["address"] = fm.group(1)

        items.append({
            "timestamp": datetime.utcnow().isoformat(),
            "type": "message",
            "data": data,
            "raw_text": line,
        })

    result = {
        "decoder": "multimon-ng",
        "protocol": protocol,
        "category": "pager",
        "items": items,
        "count": len(items),
        "error": None,
    }
    if addresses:
        result["addresses"] = list(addresses)

    return result


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
        if "id" in data:
            parts.append(f"ID:{data['id']}")
        if "temperature_C" in data:
            parts.append(f"T:{data['temperature_C']}\u00b0C")
        if "humidity" in data:
            parts.append(f"H:{data['humidity']}%")
        if "wind_avg_km_h" in data:
            parts.append(f"W:{data['wind_avg_km_h']}km/h")
        if "rain_mm" in data:
            parts.append(f"R:{data['rain_mm']}mm")
        if "pressure_hPa" in data:
            parts.append(f"P:{data['pressure_hPa']}hPa")
        if "battery_ok" in data:
            parts.append(f"bat:{'ok' if data['battery_ok'] else 'low'}")
        if "channel" in data and "temperature_C" not in data:
            parts.append(f"ch:{data['channel']}")
        if "cmd" in data:
            parts.append(f"cmd:{data['cmd']}")
        return " ".join(parts)

    if decoder == "multimon-ng" and normalized["items"]:
        data = normalized["items"][-1].get("data", {})
        addr = data.get("address", "")
        alpha = data.get("alpha", "")
        if addr:
            summary = f"{protocol} Addr:{addr}"
            if alpha:
                summary += f' "{alpha[:40]}"'
            return summary
        raw = normalized["items"][-1].get("raw_text", "")
        return f"{protocol}: {raw[:60]}" if raw else protocol

    if decoder == "satdump":
        images = normalized.get("images", [])
        if images:
            return f"{protocol} {count} dosya, {len(images)} goruntu"
        return f"{protocol} x{count}"

    return f"{protocol} x{count}"
