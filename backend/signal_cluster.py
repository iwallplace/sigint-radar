import logging
import time

logger = logging.getLogger("sigint-radar")

TTL = {
    "aircraft": 30,
    "satellite": 120,
    "weather_station": 60,
    "ism_sensor": 60,
    "pager": 30,
    "pmr": 15,
    "tetra": 15,
    "fm_broadcast": 120,
    "unknown": 45,
    "default": 30,
}

FREQ_TOLERANCE_HZ = 5000
POWER_HISTORY_MAX = 300  # 5 min at 1/sec


class SignalCluster:
    def __init__(self):
        self._clusters = {}
        self._next_id = 1

    def _append_power(self, cluster, power_db):
        """Append a power reading with timestamp, keep last 300 entries."""
        entry = {"t": time.time(), "db": power_db}
        history = cluster["power_history"]
        history.append(entry)
        if len(history) > POWER_HISTORY_MAX:
            cluster["power_history"] = history[-POWER_HISTORY_MAX:]

    def add_signal(self, sig):
        """Add or merge a signal into clusters.

        sig dict must have: freq_hz, protocol, category, power_db, snr_db,
        band_name, estimated_distance_km, weirdness_score.

        Returns (cluster_id, is_new).
        """
        freq = sig.get("freq_hz", 0)
        protocol = sig.get("protocol", "unknown")
        category = sig.get("category", "unknown")
        power_db = sig.get("power_db", -100)

        for cid, cluster in self._clusters.items():
            if (
                abs(cluster["freq_hz"] - freq) <= FREQ_TOLERANCE_HZ
                and cluster["band_name"] == sig.get("band_name", "")
            ):
                cluster["count"] += 1
                cluster["last_seen"] = time.time()
                cluster["power_db"] = power_db
                cluster["snr_db"] = sig.get("snr_db", cluster["snr_db"])
                cluster["estimated_distance_km"] = sig.get(
                    "estimated_distance_km", cluster["estimated_distance_km"]
                )
                cluster["weirdness_score"] = sig.get(
                    "weirdness_score", cluster["weirdness_score"]
                )
                # Update protocol if a real decode happened (not a guess)
                if protocol != "unknown" and protocol != cluster.get("protocol"):
                    cluster["protocol"] = protocol
                # Update decode fields
                if sig.get("decode_summary"):
                    cluster["decode_summary"] = sig["decode_summary"]
                if sig.get("decode_data"):
                    cluster["decode_data"] = sig["decode_data"]
                if sig.get("band_description"):
                    cluster["band_description"] = sig["band_description"]
                max_ttl = TTL.get(category, TTL["default"])
                cluster["ttl"] = max_ttl
                cluster["max_ttl"] = max_ttl
                self._append_power(cluster, power_db)
                return cid, False

        cid = f"sig-{self._next_id}"
        self._next_id += 1
        max_ttl = TTL.get(category, TTL["default"])
        now = time.time()

        self._clusters[cid] = {
            "id": cid,
            "freq_hz": freq,
            "protocol": protocol,
            "category": category,
            "band_name": sig.get("band_name", ""),
            "power_db": power_db,
            "snr_db": sig.get("snr_db", 0),
            "estimated_distance_km": sig.get("estimated_distance_km", 0),
            "weirdness_score": sig.get("weirdness_score", 0),
            "decode_summary": sig.get("decode_summary", ""),
            "decode_data": sig.get("decode_data"),
            "band_description": sig.get("band_description", ""),
            "count": 1,
            "first_seen": now,
            "last_seen": now,
            "ttl": max_ttl,
            "max_ttl": max_ttl,
            "power_history": [{"t": now, "db": power_db}],
        }
        return cid, True

    def tick(self):
        """Decrement TTL for all clusters. Returns list of expired cluster IDs."""
        expired = []
        for cid in list(self._clusters.keys()):
            self._clusters[cid]["ttl"] -= 1
            if self._clusters[cid]["ttl"] <= 0:
                expired.append(cid)
                del self._clusters[cid]
        return expired

    def get_cluster(self, cid):
        return self._clusters.get(cid)

    def get_all(self):
        return dict(self._clusters)
