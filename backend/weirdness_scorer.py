import time
from datetime import datetime

# Expected power levels per band (typical rx power in dBm)
EXPECTED_POWER = {
    "fm_broadcast": -40,
    "ism_433": -60,
    "ism_868": -65,
    "adsb": -55,
    "pmr446": -70,
    "tetra": -60,
    "pager": -55,
    "marine": -65,
    "weather_sat": -85,
    "radiosonde": -75,
    "amateur_2m": -70,
    "amateur_70cm": -70,
    "gsm900": -50,
}


def calculate_weirdness(signal, priority_bands=None):
    """Calculate weirdness score for a signal (0-100).

    Rules from CLAUDE.md:
    - unknown protocol: +50
    - in priority band: +30
    - power deviation >20dB from expected: +25
    - seen only once: +20
    - night time (00:00-06:00): +15
    - duration < 1s: +10
    """
    if priority_bands is None:
        priority_bands = []

    score = 0

    protocol = signal.get("protocol", "unknown")
    if protocol == "unknown":
        score += 50

    band = signal.get("band_name", "")
    if band in priority_bands:
        score += 30

    power = signal.get("power_db", -100)
    expected = EXPECTED_POWER.get(band, -60)
    if abs(power - expected) > 20:
        score += 25

    count = signal.get("count", 1)
    if count <= 1:
        score += 20

    now = datetime.utcnow()
    if 0 <= now.hour < 6:
        score += 15

    duration = signal.get("duration", None)
    if duration is not None and duration < 1:
        score += 10

    return min(score, 100)
