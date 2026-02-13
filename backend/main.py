import asyncio
import json
import logging
import random
import time

import websockets

from config import load_config
from database import Database
from signal_cluster import SignalCluster
from distance_estimator import estimate_distance_km
from weirdness_scorer import calculate_weirdness

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("sigint-radar")


FAKE_SIGNALS = [
    {
        "freq_hz": 433920000,
        "band_name": "ism_433",
        "protocol": "Bresser-5in1",
        "category": "weather_station",
        "power_db": -45,
        "snr_db": 18,
    },
    {
        "freq_hz": 433200000,
        "band_name": "ism_433",
        "protocol": "unknown",
        "category": "unknown",
        "power_db": -72,
        "snr_db": 6,
    },
    {
        "freq_hz": 446006250,
        "band_name": "pmr446",
        "protocol": "PMR446",
        "category": "radio",
        "power_db": -55,
        "snr_db": 12,
    },
    {
        "freq_hz": 137100000,
        "band_name": "weather_sat",
        "protocol": "NOAA-APT",
        "category": "satellite",
        "power_db": -90,
        "snr_db": 8,
    },
    {
        "freq_hz": 1090000000,
        "band_name": "adsb",
        "protocol": "ADS-B",
        "category": "aircraft",
        "power_db": -60,
        "snr_db": 20,
    },
]


class SignalServer:
    def __init__(self):
        self.clients = set()
        self.config = load_config()
        self.db = Database(self.config["database"]["path"])
        self.db.create_tables()
        self.rtlsdr_connected = False
        self.cluster = SignalCluster()
        self.priority_bands = self.config.get("priority_bands", [])

    async def handler(self, websocket):
        self.clients.add(websocket)
        remote = websocket.remote_address
        logger.info("Client connected: %s:%s", remote[0], remote[1])

        try:
            await websocket.send(json.dumps({
                "type": "connection_status",
                "rtlsdr_connected": self.rtlsdr_connected,
                "station": self.config["station"],
                "region": self.config["region"],
            }))

            # Send current active signals to new client
            for cid, cluster in self.cluster.get_all().items():
                await websocket.send(json.dumps({
                    "type": "signal_new",
                    "signal": cluster,
                }))

            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.route_message(data, websocket)
                except json.JSONDecodeError:
                    logger.warning("Invalid JSON from client")
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            logger.info("Client disconnected: %s:%s", remote[0], remote[1])

    async def route_message(self, data, ws):
        action = data.get("type") or data.get("action", "")
        logger.info("Received action: %s", action)

        handlers = {
            "scan_start": self._handle_not_implemented,
            "scan_stop": self._handle_not_implemented,
            "record_start": self._handle_not_implemented,
            "record_stop": self._handle_not_implemented,
            "get_decode_history": self._handle_not_implemented,
            "re_decode": self._handle_not_implemented,
            "toggle_star": self._handle_not_implemented,
            "add_note": self._handle_not_implemented,
            "delete_record": self._handle_not_implemented,
            "update_config": self._handle_not_implemented,
            "save_setup": self._handle_not_implemented,
            "get_rtlsdr_status": self._handle_rtlsdr_status,
            "replay_start": self._handle_not_implemented,
            "replay_stop": self._handle_not_implemented,
        }

        handler = handlers.get(action)
        if handler:
            await handler(data, ws)
        else:
            await ws.send(json.dumps({
                "type": "error",
                "action": action,
                "message": "unknown_action",
            }))

    async def _handle_not_implemented(self, data, ws):
        action = data.get("type") or data.get("action", "")
        await ws.send(json.dumps({
            "type": "error",
            "action": action,
            "message": "not_implemented",
        }))

    async def _handle_rtlsdr_status(self, data, ws):
        await ws.send(json.dumps({
            "type": "rtlsdr_status",
            "connected": self.rtlsdr_connected,
            "message": "connected" if self.rtlsdr_connected else "no device found",
        }))

    async def broadcast(self, msg):
        if not self.clients:
            return
        payload = json.dumps(msg) if isinstance(msg, dict) else msg
        dead = set()
        for ws in self.clients:
            try:
                await ws.send(payload)
            except websockets.exceptions.ConnectionClosed:
                dead.add(ws)
        self.clients -= dead

    async def check_rtlsdr(self):
        while True:
            try:
                from rtlsdr import RtlSdr
                sdr = RtlSdr()
                sdr.close()
                was_connected = self.rtlsdr_connected
                self.rtlsdr_connected = True
                if not was_connected:
                    logger.info("RTL-SDR device connected")
                    await self.broadcast({
                        "type": "rtlsdr_status",
                        "connected": True,
                        "message": "connected",
                    })
            except Exception:
                was_connected = self.rtlsdr_connected
                self.rtlsdr_connected = False
                if was_connected:
                    logger.info("RTL-SDR device disconnected")
                    await self.broadcast({
                        "type": "rtlsdr_status",
                        "connected": False,
                        "message": "no device found",
                    })
            await asyncio.sleep(5)

    async def ttl_tick_loop(self):
        """Decrement TTL every second and broadcast removals."""
        while True:
            expired = self.cluster.tick()
            for cid in expired:
                await self.broadcast({
                    "type": "signal_removed",
                    "signal_id": cid,
                })

            # Broadcast TTL updates for remaining signals
            for cid, cluster in self.cluster.get_all().items():
                await self.broadcast({
                    "type": "signal_update",
                    "signal": {
                        "id": cid,
                        "ttl": cluster["ttl"],
                        "max_ttl": cluster["max_ttl"],
                    },
                })

            await asyncio.sleep(1)

    async def fake_data_loop(self):
        logger.info("Fake data mode active — sending synthetic signals")
        while True:
            for template in FAKE_SIGNALS:
                freq = template["freq_hz"] + random.randint(-5000, 5000)
                power = template["power_db"] + random.uniform(-5, 5)
                freq_mhz = freq / 1e6
                distance = estimate_distance_km(
                    freq_mhz, power, category=template["category"]
                )
                sig = {
                    "freq_hz": freq,
                    "band_name": template["band_name"],
                    "protocol": template["protocol"],
                    "category": template["category"],
                    "power_db": power,
                    "snr_db": template["snr_db"] + random.uniform(-2, 2),
                    "estimated_distance_km": distance,
                }
                sig["weirdness_score"] = calculate_weirdness(
                    sig, self.priority_bands
                )

                cid, is_new = self.cluster.add_signal(sig)
                cluster = self.cluster.get_cluster(cid)

                if is_new:
                    await self.broadcast({
                        "type": "signal_new",
                        "signal": cluster,
                    })
                else:
                    await self.broadcast({
                        "type": "signal_update",
                        "signal": cluster,
                    })

            await asyncio.sleep(2)

    async def run(self):
        ws_host = self.config["websocket"]["host"]
        ws_port = self.config["websocket"]["port"]
        fake_mode = self.config["scanner"]["fake_mode"]

        logger.info("SIGINT RADAR backend starting on ws://%s:%d", ws_host, ws_port)

        async with websockets.serve(self.handler, ws_host, ws_port):
            asyncio.create_task(self.check_rtlsdr())
            asyncio.create_task(self.ttl_tick_loop())

            if fake_mode:
                asyncio.create_task(self.fake_data_loop())
            else:
                logger.info("Fake mode disabled — waiting for real RTL-SDR")

            await asyncio.Future()


if __name__ == "__main__":
    server = SignalServer()
    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        logger.info("Shutting down")
