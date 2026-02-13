"""File organizer — manages protocol-based capture folder structure.

Structure:
  data/captures/
    Prologue-TH/
      2026-02-14_01-30_433.920MHz.raw
      2026-02-14_01-30_433.920MHz.json
    POCSAG1200/
      2026-02-14_02-10_153.350MHz.raw
      2026-02-14_02-10_153.350MHz.json
      2026-02-14_02-10_153.350MHz.wav
    FM-RDS/
      2026-02-14_03-00_96.200MHz.raw
      2026-02-14_03-00_96.200MHz.wav
      2026-02-14_03-00_96.200MHz.json
    unknown/
      ...
"""

import logging
import os
import re
import shutil
from datetime import datetime
from glob import glob

logger = logging.getLogger("sigint-radar")

CAPTURE_BASE = "/app/data/captures"

# Characters to sanitize in folder names
_SAFE_RE = re.compile(r"[^A-Za-z0-9_\-.]")


def _safe_folder_name(protocol):
    """Convert protocol name to a safe folder name."""
    if not protocol or protocol == "unknown":
        return "unknown"
    return _SAFE_RE.sub("_", protocol)


def _build_filename(freq_hz, ext="raw"):
    """Build filename: YYYY-MM-DD_HH-MM_FREQMHz.ext"""
    ts = datetime.utcnow().strftime("%Y-%m-%d_%H-%M")
    freq_mhz = f"{freq_hz / 1e6:.3f}"
    return f"{ts}_{freq_mhz}MHz.{ext}"


def get_protocol_dir(protocol):
    """Return full path to the protocol subfolder, creating it if needed."""
    folder = _safe_folder_name(protocol)
    path = os.path.join(CAPTURE_BASE, folder)
    os.makedirs(path, exist_ok=True)
    return path


def organize_capture(raw_path, protocol="unknown", freq_hz=0):
    """Move a capture file (and its siblings) to the correct protocol folder.

    Siblings are files with the same base name but different extensions:
      .raw, .json, .wav, .png, _satdump/

    Returns dict of new paths: {"raw": new_raw, "json": new_json, ...}
    """
    if not raw_path or not os.path.exists(raw_path):
        return {}

    protocol_dir = get_protocol_dir(protocol)
    base_name = os.path.basename(raw_path)
    stem = base_name.rsplit(".", 1)[0]
    src_dir = os.path.dirname(raw_path)

    new_paths = {}

    # Find all sibling files (same stem, different extensions)
    for f in os.listdir(src_dir):
        if f.startswith(stem):
            src = os.path.join(src_dir, f)
            dst = os.path.join(protocol_dir, f)

            # Handle satdump output directories
            if os.path.isdir(src):
                if os.path.exists(dst):
                    shutil.rmtree(dst, ignore_errors=True)
                shutil.move(src, dst)
                new_paths["satdump_dir"] = dst
            else:
                if os.path.exists(dst) and dst != src:
                    os.remove(dst)
                if src != dst:
                    shutil.move(src, dst)

                ext = f.rsplit(".", 1)[-1].lower() if "." in f else "other"
                new_paths[ext] = dst

    return new_paths


def create_capture_path(freq_hz, protocol="unknown"):
    """Create a new capture file path in the correct protocol folder.

    Returns the full path for the .raw file.
    """
    protocol_dir = get_protocol_dir(protocol)
    filename = _build_filename(freq_hz, "raw")
    return os.path.join(protocol_dir, filename)


def get_folder_tree():
    """Return the folder tree structure for the History tab.

    Returns list of dicts:
      [{"name": "Prologue-TH", "count": 5, "size_bytes": 123456}, ...]
    """
    os.makedirs(CAPTURE_BASE, exist_ok=True)
    tree = []

    for entry in sorted(os.listdir(CAPTURE_BASE)):
        folder_path = os.path.join(CAPTURE_BASE, entry)
        if not os.path.isdir(folder_path):
            continue

        # Count files and total size
        count = 0
        total_size = 0
        for f in os.listdir(folder_path):
            fp = os.path.join(folder_path, f)
            if os.path.isfile(fp):
                count += 1
                total_size += os.path.getsize(fp)

        # Count unique recordings (by .raw files)
        raw_count = sum(1 for f in os.listdir(folder_path) if f.endswith(".raw"))

        tree.append({
            "name": entry,
            "path": folder_path,
            "file_count": count,
            "recording_count": raw_count,
            "size_bytes": total_size,
        })

    return tree


def get_associated_files(raw_path):
    """Get all files associated with a recording (raw, json, wav, png, etc.)

    Returns dict: {"raw": path, "json": path, "wav": path, "images": [paths]}
    """
    if not raw_path:
        return {}

    stem = raw_path.rsplit(".", 1)[0]
    src_dir = os.path.dirname(raw_path)
    result = {}
    images = []

    if not os.path.isdir(src_dir):
        return {}

    for f in os.listdir(src_dir):
        fp = os.path.join(src_dir, f)
        base = os.path.basename(f)

        # Match files with same stem
        file_stem = base.rsplit(".", 1)[0] if "." in base else base
        if file_stem != os.path.basename(stem):
            continue

        if os.path.isdir(fp):
            # satdump output directory — check for images inside
            for sf in os.listdir(fp):
                sfp = os.path.join(fp, sf)
                if sf.lower().endswith((".png", ".jpg", ".jpeg")):
                    images.append(sfp)
            result["satdump_dir"] = fp
        elif f.endswith(".raw"):
            result["raw"] = fp
        elif f.endswith(".json"):
            result["json"] = fp
        elif f.endswith(".wav"):
            result["wav"] = fp
        elif f.lower().endswith((".png", ".jpg", ".jpeg")):
            images.append(fp)

    if images:
        result["images"] = images

    return result


def migrate_existing_captures():
    """Migrate existing flat captures to protocol-based folders.

    Called once on startup to handle legacy data.
    Only moves files that are in the base captures dir (not in subfolders).
    """
    if not os.path.isdir(CAPTURE_BASE):
        os.makedirs(CAPTURE_BASE, exist_ok=True)
        return 0

    moved = 0
    raw_files = [f for f in os.listdir(CAPTURE_BASE)
                 if f.endswith(".raw") and os.path.isfile(os.path.join(CAPTURE_BASE, f))]

    for raw_name in raw_files:
        raw_path = os.path.join(CAPTURE_BASE, raw_name)
        stem = raw_name.rsplit(".", 1)[0]

        # Check if there's a JSON file with protocol info
        json_path = os.path.join(CAPTURE_BASE, stem + ".json")
        protocol = "unknown"

        if os.path.isfile(json_path):
            try:
                import json
                with open(json_path, "r") as f:
                    data = json.load(f)
                protocol = data.get("protocol", "unknown")
            except Exception:
                pass

        if protocol and protocol != "unknown":
            result = organize_capture(raw_path, protocol)
            if result:
                moved += 1
        else:
            result = organize_capture(raw_path, "unknown")
            if result:
                moved += 1

    if moved > 0:
        logger.info("Migrated %d legacy captures to protocol folders", moved)
    return moved
