"""Aircraft tracker using OpenSky Network API."""

import asyncio
import logging
import math
import time

import aiohttp

logger = logging.getLogger("sigint-radar")


class AircraftTracker:
    """Fetches aircraft positions from OpenSky and broadcasts as signals."""

    def __init__(self, config, cluster, broadcast_fn):
        self.config = config
        self.cluster = cluster
        self.broadcast = broadcast_fn

        aircraft_cfg = config.get("aircraft", {})
        self.api_url = aircraft_cfg.get(
            "api_url", "https://opensky-network.org/api/states/all"
        )
        self.refresh_seconds = aircraft_cfg.get("api_refresh_seconds", 10)
        self.radius_km = aircraft_cfg.get("api_radius_km", 200)
        self.enabled = aircraft_cfg.get("source", "api") == "api"

        station = config.get("station", {})
        self.lat = station.get("lat", 0.0)
        self.lon = station.get("lon", 0.0)

    def _bounding_box(self):
        """Calculate lat/lon bounding box from station + radius."""
        # ~111km per degree latitude
        dlat = self.radius_km / 111.0
        # Longitude varies by latitude
        dlon = self.radius_km / (111.0 * max(math.cos(math.radians(self.lat)), 0.01))
        return {
            "lamin": self.lat - dlat,
            "lamax": self.lat + dlat,
            "lomin": self.lon - dlon,
            "lomax": self.lon + dlon,
        }

    async def run(self):
        """Main loop: fetch aircraft positions periodically."""
        if not self.enabled:
            logger.info("Aircraft tracker disabled")
            return

        if self.lat == 0.0 and self.lon == 0.0:
            logger.info("Aircraft tracker: no station position, skipping")
            return

        logger.info(
            "Aircraft tracker started: radius=%dkm, refresh=%ds",
            self.radius_km,
            self.refresh_seconds,
        )

        while True:
            try:
                await self._fetch_and_broadcast()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Aircraft tracker error: %s", e)
            await asyncio.sleep(self.refresh_seconds)

    async def _fetch_and_broadcast(self):
        """Fetch from OpenSky API and broadcast aircraft as signals."""
        bbox = self._bounding_box()
        params = {
            "lamin": f"{bbox['lamin']:.4f}",
            "lamax": f"{bbox['lamax']:.4f}",
            "lomin": f"{bbox['lomin']:.4f}",
            "lomax": f"{bbox['lomax']:.4f}",
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    self.api_url, params=params, timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status != 200:
                        logger.warning("OpenSky API returned %d", resp.status)
                        return
                    data = await resp.json()
        except asyncio.TimeoutError:
            logger.warning("OpenSky API timeout")
            return
        except Exception as e:
            logger.warning("OpenSky API error: %s", e)
            return

        states = data.get("states") or []
        logger.info("Aircraft tracker: %d aircraft in range", len(states))

        for state in states:
            if len(state) < 14:
                continue

            callsign = (state[1] or "").strip()
            lat = state[6]
            lon = state[5]
            altitude = state[7]  # barometric altitude (m)
            velocity = state[9]  # ground speed (m/s)
            heading = state[10]

            if lat is None or lon is None:
                continue

            # Calculate distance from station
            distance = self._haversine(self.lat, self.lon, lat, lon)

            icao24 = state[0]
            freq_hz = 1090e6  # ADS-B frequency

            sig = {
                "freq_hz": freq_hz,
                "band_name": "adsb",
                "protocol": "ADS-B",
                "category": "aircraft",
                "power_db": -50.0,  # Estimated
                "snr_db": 15.0,
                "estimated_distance_km": round(distance, 1),
                "weirdness_score": 0,
                "decode_summary": self._make_summary(
                    callsign, altitude, velocity, heading
                ),
                "aircraft": {
                    "icao24": icao24,
                    "callsign": callsign,
                    "lat": lat,
                    "lon": lon,
                    "altitude_m": altitude,
                    "velocity_ms": velocity,
                    "heading": heading,
                    "on_ground": state[8],
                },
            }

            cid, is_new = self.cluster.add_signal(sig)
            cluster = self.cluster.get_cluster(cid)

            if is_new:
                await self.broadcast({"type": "signal_new", "signal": cluster})
            else:
                await self.broadcast({"type": "signal_update", "signal": cluster})

    def _make_summary(self, callsign, altitude, velocity, heading):
        parts = []
        if callsign:
            parts.append(callsign)
        if altitude is not None:
            parts.append(f"ALT:{int(altitude)}m")
        if velocity is not None:
            parts.append(f"SPD:{int(velocity)}m/s")
        if heading is not None:
            parts.append(f"HDG:{int(heading)}")
        return " ".join(parts) if parts else "Aircraft"

    @staticmethod
    def _haversine(lat1, lon1, lat2, lon2):
        """Calculate distance between two points in km."""
        R = 6371.0
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(math.radians(lat1))
            * math.cos(math.radians(lat2))
            * math.sin(dlon / 2) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c
