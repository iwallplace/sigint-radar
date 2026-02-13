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
    normalize_fm_rds,
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

    # FM broadcast: use rtl_fm decoder for 88-108 MHz
    freq_mhz = freq_hz / 1e6
    if not decoder and 88.0 <= freq_mhz <= 108.0:
        decoder = "rtl_fm"
    if decoder_override == "rtl_fm":
        decoder = "rtl_fm"

    if not decoder:
        # Provide meaningful message for undecoded signals
        return None, _undecoded_result(freq_hz)

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
        elif decoder == "rtl_fm":
            return _decode_fm(raw_path, freq_hz, json_path)
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


def _undecoded_result(freq_hz):
    """Generate a descriptive result for signals that can't be decoded."""
    freq_mhz = freq_hz / 1e6

    # Provide explanation based on frequency range
    explanations = [
        (118, 136, "Havacilik telsizi — analog ses, decode edilemez, sadece IQ kaydı"),
        (144, 148, "Amator 2m telsiz — analog ses, decode edilemez"),
        (156, 162, "Denizcilik VHF — analog ses, decode edilemez"),
        (380, 400, "TETRA dijital telsiz — sifreli, decode edilemez"),
        (410, 430, "TETRA ozel telsiz — sifreli, decode edilemez"),
        (430, 440, "Amator 70cm telsiz — analog/dijital, decode edilemez"),
        (446, 446.2, "PMR446 lisanssiz telsiz — analog ses, decode edilemez"),
        (935, 960, "GSM 900 downlink — sifreli, decode edilemez"),
        (1525, 1559, "L-Band uydu — ozel protokol, decode edilemez"),
    ]

    desc = "Bu sinyal turune uygun decoder bulunamadi — sadece IQ kaydı yapilabilir"
    for low, high, explanation in explanations:
        if low <= freq_mhz <= high:
            desc = explanation
            break

    return {
        "decoder": "none",
        "protocol": "unknown",
        "category": "unknown",
        "items": [],
        "count": 0,
        "error": desc,
    }


def _decode_rtl433(raw_path, freq_hz, json_path):
    """Decode IQ file with rtl_433.

    File format: cu8 (unsigned 8-bit interleaved IQ), 2.4 MSps.
    rtl_433 auto-detects cu8 from .raw extension, but we specify explicitly
    via the filename:PARAMS syntax for reliability.
    """
    # rtl_433 -r file:cu8:2400000 format for explicit IQ specification
    file_spec = f"{raw_path}:cu8:{int(2400000)}"
    cmd = [
        "rtl_433",
        "-r", file_spec,
        "-f", str(int(freq_hz)),
        "-F", "json",
    ]
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=60
    )
    lines = [l for l in result.stdout.strip().split("\n") if l.strip()]
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

    # Keep the WAV file for audio playback in History tab

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


def _decode_fm(raw_path, freq_hz, json_path):
    """Decode FM broadcast IQ file -> WAV audio + RDS data.

    Pipeline:
      1. sox converts raw IQ (uint8, 2ch, 2.4MSps) to mono WAV (48kHz audio)
      2. redsea attempts RDS decode from the WAV for station name/PI code
    """
    wav_path = raw_path.rsplit(".", 1)[0] + ".wav"

    # Step 1: FM demodulate IQ to audio WAV using sox
    sox_cmd = (
        f"sox -t raw -r 2400000 -e unsigned-integer -b 8 -c 2 '{raw_path}' "
        f"-t wav -r 48000 -e signed-integer -b 16 -c 1 '{wav_path}' "
        f"sinc 15-15000 2>/dev/null"
    )
    subprocess.run(sox_cmd, shell=True, timeout=60)

    rds_data = {}
    protocol = "FM-Broadcast"

    # Step 2: Try RDS decode with redsea if available
    try:
        rds_cmd = (
            f"sox '{wav_path}' -t raw -r 171000 -e signed-integer -b 16 -c 1 - 2>/dev/null | "
            f"redsea --feed-through 2>/dev/null"
        )
        result = subprocess.run(
            rds_cmd, shell=True, capture_output=True, text=True, timeout=30
        )
        if result.stdout.strip():
            for line in result.stdout.strip().split("\n"):
                line = line.strip()
                if not line:
                    continue
                try:
                    rds = json.loads(line)
                    if "ps" in rds:
                        rds_data["station"] = rds["ps"].strip()
                    if "pi" in rds:
                        rds_data["pi"] = rds["pi"]
                    if "radiotext" in rds:
                        rds_data["radiotext"] = rds["radiotext"].strip()
                    if "pty" in rds:
                        rds_data["pty"] = rds["pty"]
                    if rds_data.get("station"):
                        protocol = "FM-RDS"
                except json.JSONDecodeError:
                    continue
    except (subprocess.TimeoutExpired, FileNotFoundError):
        logger.debug("redsea not available or timed out, skipping RDS decode")

    # If redsea not available, try rtl_433 for RDS
    if not rds_data:
        try:
            cmd = [
                "rtl_433", "-r", raw_path,
                "-s", "2400000",
                "-f", str(int(freq_hz)),
                "-F", "json",
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.stdout.strip():
                for line in result.stdout.strip().split("\n"):
                    try:
                        d = json.loads(line.strip())
                        if d.get("model"):
                            rds_data["model"] = d["model"]
                    except json.JSONDecodeError:
                        continue
        except Exception:
            pass

    normalized = normalize_fm_rds(rds_data, wav_path, freq_hz)
    normalized["protocol"] = protocol

    with open(json_path, "w") as f:
        json.dump(normalized, f, indent=2)

    return json_path, normalized
