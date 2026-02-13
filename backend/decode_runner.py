"""Decode IQ files offline (for post-recording decode in future phases)."""

import json
import logging
import os
import subprocess

from decoder_manager import select_decoder
from decode_normalizer import (
    normalize_rtl433,
    normalize_multimon,
    normalize_readsb,
    normalize_satdump,
)

logger = logging.getLogger("sigint-radar")


def decode_file(raw_path, freq_hz, decoder_override=None):
    """Decode an IQ file and return (json_path, normalized_result).

    Args:
        raw_path: Path to raw IQ file
        freq_hz: Center frequency
        decoder_override: Force a specific decoder

    Returns:
        (json_path, normalized_result) or (None, error_result)
    """
    decoder = decoder_override or select_decoder(freq_hz)
    if not decoder:
        return None, {
            "decoder": "none",
            "protocol": "unknown",
            "category": "unknown",
            "items": [],
            "count": 0,
            "error": f"No decoder for frequency {freq_hz / 1e6:.3f} MHz",
        }

    json_path = raw_path.rsplit(".", 1)[0] + ".json"

    try:
        if decoder == "rtl_433":
            return _decode_rtl433(raw_path, freq_hz, json_path)
        elif decoder == "multimon-ng":
            return _decode_multimon(raw_path, freq_hz, json_path)
        elif decoder == "readsb":
            return _decode_readsb(raw_path, json_path)
        elif decoder == "satdump":
            return _decode_satdump(raw_path, freq_hz, json_path)
        else:
            return None, {
                "decoder": decoder,
                "protocol": "unknown",
                "category": "unknown",
                "items": [],
                "count": 0,
                "error": f"Decoder '{decoder}' not implemented for file decode",
            }
    except Exception as e:
        logger.error("Decode error (%s): %s", decoder, e)
        return None, {
            "decoder": decoder,
            "protocol": "unknown",
            "category": "unknown",
            "items": [],
            "count": 0,
            "error": str(e),
        }


def _decode_rtl433(raw_path, freq_hz, json_path):
    """Decode IQ file with rtl_433."""
    cmd = [
        "rtl_433", "-r", raw_path,
        "-s", "2400000",
        "-f", str(int(freq_hz)),
        "-F", "json",
    ]
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=30
    )
    lines = result.stdout.strip().split("\n")
    normalized = normalize_rtl433(lines)

    with open(json_path, "w") as f:
        json.dump(normalized, f, indent=2)

    return json_path, normalized


def _decode_multimon(raw_path, freq_hz, json_path):
    """Decode IQ file with multimon-ng (via sox conversion).

    Pipeline: raw IQ (uint8, 2ch, 2.4MSps) → sox → WAV (16bit, 1ch, 22050) → multimon-ng
    """
    wav_path = raw_path.rsplit(".", 1)[0] + ".wav"
    # Step 1: Convert raw IQ to WAV using sox
    sox_cmd = (
        f"sox -t raw -r 2400000 -e unsigned-integer -b 8 -c 2 '{raw_path}' "
        f"-t wav -r 22050 -e signed-integer -b 16 -c 1 '{wav_path}' 2>/dev/null"
    )
    subprocess.run(sox_cmd, shell=True, timeout=30)

    # Step 2: Decode WAV with multimon-ng
    cmd = (
        f"multimon-ng -t wav -a POCSAG512 -a POCSAG1200 -a POCSAG2400 -a FLEX '{wav_path}'"
    )
    result = subprocess.run(
        cmd, shell=True, capture_output=True, text=True, timeout=30
    )
    lines = result.stdout.strip().split("\n")
    # Filter out multimon-ng banner lines
    lines = [l for l in lines if l.strip() and not l.startswith("multimon-ng")]
    normalized = normalize_multimon(lines)

    with open(json_path, "w") as f:
        json.dump(normalized, f, indent=2)

    # Clean up temporary WAV file
    try:
        if os.path.exists(wav_path):
            os.remove(wav_path)
    except OSError:
        pass

    return json_path, normalized


def _decode_readsb(raw_path, json_path):
    """Decode IQ file with readsb."""
    cmd = ["readsb", "--ifile", raw_path, "--quiet"]
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=30
    )
    lines = result.stdout.strip().split("\n")
    normalized = normalize_readsb(lines)

    with open(json_path, "w") as f:
        json.dump(normalized, f, indent=2)

    return json_path, normalized


def _decode_satdump(raw_path, freq_hz, json_path):
    """Decode IQ file with SatDump CLI.

    Pipeline selection based on frequency:
      137-138 MHz → NOAA APT (noaa_apt)
      138-139 MHz → Meteor M2 LRPT (meteor_m2_lrpt)
      L-band      → generic (metop_ahrpt)
    """
    output_dir = raw_path.rsplit(".", 1)[0] + "_satdump"
    os.makedirs(output_dir, exist_ok=True)

    freq_mhz = freq_hz / 1e6

    # Select pipeline based on frequency
    if 136.0 <= freq_mhz <= 138.0:
        pipeline = "noaa_apt"
        protocol = "NOAA-APT"
    elif 138.0 < freq_mhz <= 139.0:
        pipeline = "meteor_m2_lrpt"
        protocol = "Meteor-M2-LRPT"
    elif freq_mhz > 1500:
        pipeline = "metop_ahrpt"
        protocol = "MetOp-AHRPT"
    else:
        pipeline = "noaa_apt"
        protocol = "NOAA-APT"

    # SatDump offline processing (not 'live')
    cmd = [
        "satdump", pipeline,
        raw_path,
        output_dir,
        "--source", "file",
        "--samplerate", "2400000",
        "--frequency", str(int(freq_hz)),
    ]
    subprocess.run(
        cmd, capture_output=True, text=True, timeout=120
    )

    files = os.listdir(output_dir) if os.path.isdir(output_dir) else []
    # Separate image files for display
    images = [f for f in files if f.lower().endswith((".png", ".jpg", ".jpeg"))]
    normalized = normalize_satdump(output_dir, files)
    normalized["protocol"] = protocol
    if images:
        normalized["images"] = [f"{output_dir}/{img}" for img in images]

    with open(json_path, "w") as f:
        json.dump(normalized, f, indent=2)

    return json_path, normalized
