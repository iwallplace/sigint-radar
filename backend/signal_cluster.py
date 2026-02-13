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


class SignalCluster:
    def __init__(self):
        self._clusters = {}
        self._next_id = 1

    def add_signal(self, sig):
        """Add or merge a signal into clusters.

        sig dict must have: freq_hz, protocol, category, power_db, snr_db,
        band_name, estimated_distance_km, weirdness_score.

        Returns (cluster_id, is_new).
        """
        freq = sig.get("freq_hz", 0)
        protocol = sig.get("protocol", "unknown")
        category = sig.get("category", "unknown")

        for cid, cluster in self._clusters.items():
            if (
                abs(cluster["freq_hz"] - freq) <= FREQ_TOLERANCE_HZ
                and cluster["protocol"] == protocol
            ):
                cluster["count"] += 1
                cluster["last_seen"] = time.time()
                cluster["power_db"] = sig.get("power_db", cluster["power_db"])
                cluster["snr_db"] = sig.get("snr_db", cluster["snr_db"])
                cluster["estimated_distance_km"] = sig.get(
                    "estimated_distance_km", cluster["estimated_distance_km"]
                )
                cluster["weirdness_score"] = sig.get(
                    "weirdness_score", cluster["weirdness_score"]
                )
                max_ttl = TTL.get(category, TTL["default"])
                cluster["ttl"] = max_ttl
                cluster["max_ttl"] = max_ttl
                return cid, False

        cid = f"sig-{self._next_id}"
        self._next_id += 1
        max_ttl = TTL.get(category, TTL["default"])

        self._clusters[cid] = {
            "id": cid,
            "freq_hz": freq,
            "protocol": protocol,
            "category": category,
            "band_name": sig.get("band_name", ""),
            "power_db": sig.get("power_db", -100),
            "snr_db": sig.get("snr_db", 0),
            "estimated_distance_km": sig.get("estimated_distance_km", 0),
            "weirdness_score": sig.get("weirdness_score", 0),
            "count": 1,
            "first_seen": time.time(),
            "last_seen": time.time(),
            "ttl": max_ttl,
            "max_ttl": max_ttl,
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
