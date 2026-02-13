import os
import yaml
import logging

logger = logging.getLogger("sigint-radar")

DEFAULTS = {
    "rtlsdr": {
        "device_index": 0,
        "sample_rate": 2400000,
        "gain": 40,
        "bias_tee": False,
        "ppm_correction": 0,
    },
    "station": {
        "lat": 0.0,
        "lon": 0.0,
        "name": "",
        "altitude_m": 0,
        "location_source": "config",
    },
    "region": {"profile": "auto"},
    "scanner": {
        "enabled": True,
        "fake_mode": False,
        "cycle_delay_ms": 500,
        "fft_size": 2048,
        "fft_averages": 16,
        "signal_threshold_db": 10,
    },
    "bands": {
        "fm_broadcast": {"enabled": True, "priority": "low"},
        "aviation": {"enabled": True, "priority": "high"},
        "ism_433": {"enabled": True, "priority": "high", "decoder": "rtl_433"},
        "ism_868": {"enabled": True, "priority": "high", "decoder": "rtl_433"},
        "ism_915": {"enabled": False, "priority": "high", "decoder": "rtl_433"},
        "adsb": {"enabled": True, "priority": "high", "decoder": "readsb"},
        "tetra": {"enabled": True, "priority": "medium"},
        "p25": {"enabled": False, "priority": "medium"},
        "weather_sat": {"enabled": True, "priority": "medium", "decoder": "satdump"},
        "radiosonde": {"enabled": True, "priority": "medium"},
        "marine": {"enabled": True, "priority": "low"},
        "pager": {"enabled": True, "priority": "medium", "decoder": "multimon-ng"},
        "pmr446": {"enabled": True, "priority": "low"},
        "frs_gmrs": {"enabled": False, "priority": "low"},
        "amateur_2m": {"enabled": True, "priority": "low"},
        "amateur_70cm": {"enabled": True, "priority": "low"},
        "gsm900": {"enabled": True, "priority": "low"},
        "lband_sat": {"enabled": False, "priority": "low"},
    },
    "priority_bands": ["ism_433", "ism_868"],
    "aircraft": {
        "source": "api",
        "api_url": "https://opensky-network.org/api/states/all",
        "api_refresh_seconds": 10,
        "api_radius_km": 200,
    },
    "decoders": {
        "rtl_433": {"output_format": "json", "protocols": "all"},
        "readsb": {"max_range": 400},
        "multimon_ng": {"protocols": ["POCSAG512", "POCSAG1200", "POCSAG2400", "FLEX"]},
        "satdump": {"mode": "cli"},
    },
    "websocket": {"host": "0.0.0.0", "port": 8765},
    "rest_api": {"host": "0.0.0.0", "port": 8080},
    "database": {"path": "/app/data/signals.db", "retention_days": 30},
    "recording": {
        "max_duration_seconds": 60,
        "captures_dir": "/app/data/captures",
        "auto_decode": True,
        "max_disk_usage_gb": 10,
        "keep_raw_after_decode": True,
    },
    "alerts": {"weirdness_threshold": 40, "sound": True, "desktop_notification": True},
    "ui": {
        "theme": "dark",
        "language": "en",
        "radar_range_km": 200,
        "waterfall_history_seconds": 60,
        "globe_visible": True,
    },
    "setup_complete": False,
}


def _deep_merge(base, override):
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def load_config(path=None):
    if path is None:
        path = os.environ.get("CONFIG_PATH", "/app/config.yaml")

    config = DEFAULTS.copy()

    try:
        with open(path, "r") as f:
            user_config = yaml.safe_load(f) or {}
        config = _deep_merge(DEFAULTS, user_config)
        logger.info("Config loaded from %s", path)
    except FileNotFoundError:
        logger.warning("Config file not found at %s, using defaults", path)
    except Exception as e:
        logger.error("Error loading config: %s, using defaults", e)

    return config
