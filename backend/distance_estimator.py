import math

TX_POWER = {
    "fm_broadcast": 60,
    "tetra": 40,
    "gsm_bts": 43,
    "pmr446": 10,
    "pmr": 10,
    "radio": 10,
    "ism_433": 0,
    "ism_868": 7,
    "lora": 14,
    "adsb": 20,
    "aircraft": 20,
    "radiosonde": 20,
    "pocsag": 30,
    "pager": 30,
    "marine_vhf": 25,
    "marine": 25,
    "weather_station": 0,
    "ism_sensor": 0,
    "satellite": 20,
    "unknown": 10,
}


def estimate_distance_km(freq_mhz, rx_dbm, tx_dbm=None, category=None):
    """Estimate distance using Free Space Path Loss.

    FSPL = tx_dbm - rx_dbm - 20*log10(freq_mhz) - 32.44
    distance_km = 10^(FSPL/20)
    """
    if tx_dbm is None:
        tx_dbm = TX_POWER.get(category or "unknown", 10)

    try:
        if freq_mhz <= 0:
            return 0.1
        fspl = tx_dbm - rx_dbm - 20 * math.log10(freq_mhz) - 32.44
        distance = 10 ** (fspl / 20)
        return max(0.1, min(distance, 800))
    except (ValueError, ZeroDivisionError):
        return 0.1
