"""Region detection and band loading."""

import logging

from .base import UNIVERSAL_BANDS
from .eu import EU_BANDS
from .us import US_BANDS

logger = logging.getLogger("sigint-radar")

REGION_MAP = {
    "TR": "eu",
    "DE": "eu",
    "FR": "eu",
    "GB": "eu",
    "IT": "eu",
    "ES": "eu",
    "NL": "eu",
    "BE": "eu",
    "AT": "eu",
    "CH": "eu",
    "PL": "eu",
    "CZ": "eu",
    "SE": "eu",
    "NO": "eu",
    "DK": "eu",
    "FI": "eu",
    "PT": "eu",
    "GR": "eu",
    "RO": "eu",
    "HU": "eu",
    "IE": "eu",
    "HR": "eu",
    "BG": "eu",
    "SK": "eu",
    "SI": "eu",
    "LT": "eu",
    "LV": "eu",
    "EE": "eu",
    "US": "us",
    "CA": "us",
    "MX": "us",
}

REGION_BANDS = {
    "eu": EU_BANDS,
    "us": US_BANDS,
}


def detect_region(lat, lon):
    """Detect regulatory region from coordinates using reverse geocode."""
    if lat == 0.0 and lon == 0.0:
        logger.info("No coordinates set, defaulting to EU region")
        return "eu"

    try:
        import reverse_geocode

        result = reverse_geocode.search([(lat, lon)])
        if result:
            country = result[0].get("country_code", "").upper()
            region = REGION_MAP.get(country, "eu")
            logger.info(
                "Detected country=%s, region=%s for (%.4f, %.4f)",
                country,
                region,
                lat,
                lon,
            )
            return region
    except Exception as e:
        logger.warning("Region detection failed: %s, defaulting to EU", e)

    return "eu"


def load_bands(region, band_config=None):
    """Load bands for a region, merging universal + regional bands.

    band_config is the bands section from config.yaml used to
    override enabled/priority per band.
    """
    bands = {}
    band_config = band_config or {}

    # Universal bands
    for name, band in UNIVERSAL_BANDS.items():
        entry = dict(band)
        entry["name"] = name
        entry["region"] = "universal"

        cfg = band_config.get(name, {})
        if isinstance(cfg, dict):
            entry["enabled"] = cfg.get("enabled", entry.get("enabled", True))
            entry["priority"] = cfg.get("priority", entry.get("priority", "low"))
            if "decoder" in cfg:
                entry["decoder"] = cfg["decoder"]
        else:
            entry["enabled"] = True

        bands[name] = entry

    # Regional bands
    regional = REGION_BANDS.get(region, {})
    for name, band in regional.items():
        entry = dict(band)
        entry["name"] = name
        entry["region"] = region

        cfg = band_config.get(name, {})
        if isinstance(cfg, dict):
            entry["enabled"] = cfg.get("enabled", entry.get("enabled", True))
            entry["priority"] = cfg.get("priority", entry.get("priority", "low"))
            if "decoder" in cfg:
                entry["decoder"] = cfg["decoder"]
        else:
            entry["enabled"] = True

        bands[name] = entry

    logger.info(
        "Loaded %d bands for region=%s (%d universal + %d regional)",
        len(bands),
        region,
        len(UNIVERSAL_BANDS),
        len(regional),
    )
    return bands
