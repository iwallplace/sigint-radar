"""Live decoder manager — runs decoder subprocesses during scanning."""

import asyncio
import json
import logging
import random
from datetime import datetime

from decode_normalizer import (
    normalize_rtl433,
    normalize_multimon,
    normalize_fm_rds,
    make_decode_summary,
    MODEL_CATEGORY,
)

logger = logging.getLogger("sigint-radar")

# Frequency → decoder mapping
DECODER_RANGES = [
    (88e6, 108e6, "rtl_fm"),
    (432e6, 435e6, "rtl_433"),
    (866e6, 870e6, "rtl_433"),
    (912e6, 918e6, "rtl_433"),
    (136e6, 138e6, "satdump"),
    (1088e6, 1092e6, "readsb"),
    (148e6, 175e6, "multimon-ng"),
    (440e6, 470e6, "multimon-ng"),
    (928e6, 930e6, "multimon-ng"),
]

# Fake decode templates for fake_mode
FAKE_DECODES = [
    {
        "decoder": "rtl_433",
        "model": "Bresser-5in1",
        "category": "weather_station",
        "data": lambda: {
            "model": "Bresser-5in1",
            "id": 142,
            "temperature_C": round(random.uniform(-5, 35), 1),
            "humidity": random.randint(30, 95),
            "wind_avg_km_h": round(random.uniform(0, 40), 1),
            "wind_dir_deg": random.choice([0, 45, 90, 135, 180, 225, 270, 315]),
            "rain_mm": round(random.uniform(0, 50), 1),
            "battery_ok": 1,
        },
    },
    {
        "decoder": "rtl_433",
        "model": "Prologue-TH",
        "category": "weather_station",
        "data": lambda: {
            "model": "Prologue-TH",
            "id": 7,
            "channel": random.randint(1, 3),
            "temperature_C": round(random.uniform(10, 30), 1),
            "humidity": random.randint(40, 80),
            "battery_ok": 1,
        },
    },
    {
        "decoder": "rtl_433",
        "model": "Generic-Remote",
        "category": "ism_sensor",
        "data": lambda: {
            "model": "Generic-Remote",
            "id": random.randint(1000, 9999),
            "cmd": random.choice(["on", "off", "dim"]),
            "channel": random.randint(1, 4),
        },
    },
    {
        "decoder": "multimon-ng",
        "model": "POCSAG",
        "category": "pager",
        "data": lambda: {
            "text": f"POCSAG1200: Address: {random.randint(1000000, 9999999)} "
            f"Function: {random.randint(0, 3)} "
            f"Alpha: {random.choice(['Test page', 'Unit dispatch', 'Code 3', 'Maintenance req'])}",
        },
    },
    {
        "decoder": "rtl_fm",
        "model": "FM-RDS",
        "category": "fm_broadcast",
        "data": lambda: {
            "station": random.choice(["Power FM", "NTV Radyo", "TRT FM", "Joy FM", "Kral FM", "Best FM", "Virgin Radio"]),
            "pi": f"{random.randint(0x1000, 0xFFFF):04X}",
            "freq_mhz": round(random.uniform(88.0, 108.0), 1),
        },
    },
]


def select_decoder(freq_hz):
    """Select decoder based on frequency from DECODER_RANGES."""
    for low, high, decoder in DECODER_RANGES:
        if low <= freq_hz <= high:
            return decoder
    return None


class DecoderManager:
    """Manages live decoder subprocesses."""

    def __init__(self, config=None):
        self.config = config or {}
        self._process = None
        self._active_freq = None
        self._active_decoder = None
        self.fake_mode = (config or {}).get("scanner", {}).get("fake_mode", True)

    async def start_live_decode(self, freq_hz, band_name):
        """Start a live decoder for the given frequency.

        Returns an async generator yielding normalized decode events.
        """
        await self.stop_live_decode()

        decoder = select_decoder(freq_hz)
        if not decoder:
            return

        self._active_freq = freq_hz
        self._active_decoder = decoder

        if self.fake_mode:
            async for event in self._fake_decode(freq_hz, band_name, decoder):
                yield event
            return

        try:
            if decoder == "rtl_433":
                async for event in self._run_rtl433(freq_hz):
                    yield event
            elif decoder == "multimon-ng":
                async for event in self._run_multimon(freq_hz):
                    yield event
            else:
                logger.debug("Live decode not supported for %s", decoder)
        except Exception as e:
            logger.error("Decoder %s error: %s", decoder, e)
        finally:
            await self.stop_live_decode()

    async def stop_live_decode(self):
        """Kill active decoder subprocess."""
        if self._process:
            try:
                self._process.kill()
                await self._process.wait()
            except Exception:
                pass
            self._process = None
        self._active_freq = None
        self._active_decoder = None

    async def _run_rtl433(self, freq_hz):
        """Run rtl_433 subprocess and yield decoded packets."""
        freq_mhz = freq_hz / 1e6
        cmd = [
            "rtl_433", "-f", str(int(freq_hz)),
            "-F", "json", "-M", "time",
        ]

        try:
            self._process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )

            while self._process.returncode is None:
                try:
                    line = await asyncio.wait_for(
                        self._process.stdout.readline(), timeout=30
                    )
                except asyncio.TimeoutError:
                    break

                if not line:
                    break

                text = line.decode("utf-8", errors="replace").strip()
                if not text:
                    continue

                result = normalize_rtl433([text])
                if result["count"] > 0:
                    result["_summary"] = make_decode_summary(result)
                    yield result

        except Exception as e:
            logger.error("rtl_433 subprocess error: %s", e)

    async def _run_multimon(self, freq_hz):
        """Run rtl_fm | multimon-ng pipeline and yield decoded messages."""
        protocols = self.config.get("decoders", {}).get(
            "multimon_ng", {}
        ).get("protocols", ["POCSAG512", "POCSAG1200", "POCSAG2400", "FLEX"])

        proto_args = []
        for p in protocols:
            proto_args.extend(["-a", p])

        cmd = (
            f"rtl_fm -f {int(freq_hz)} -s 22050 -g 40 2>/dev/null | "
            f"multimon-ng -t raw {' '.join(proto_args)} -"
        )

        try:
            self._process = await asyncio.create_subprocess_shell(
                cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )

            while self._process.returncode is None:
                try:
                    line = await asyncio.wait_for(
                        self._process.stdout.readline(), timeout=30
                    )
                except asyncio.TimeoutError:
                    break

                if not line:
                    break

                text = line.decode("utf-8", errors="replace").strip()
                if not text or text.startswith("multimon-ng"):
                    continue

                result = normalize_multimon([text])
                if result["count"] > 0:
                    result["_summary"] = make_decode_summary(result)
                    yield result

        except Exception as e:
            logger.error("multimon-ng subprocess error: %s", e)

    async def _fake_decode(self, freq_hz, band_name, decoder):
        """Generate fake decode results for testing."""
        # Pick templates matching the decoder
        templates = [t for t in FAKE_DECODES if t["decoder"] == decoder]
        if not templates:
            return

        # Generate 1-3 fake decode events
        for _ in range(random.randint(1, 3)):
            tmpl = random.choice(templates)
            data = tmpl["data"]()
            ts = datetime.utcnow().isoformat()

            if decoder == "rtl_433":
                data["time"] = ts
                result = normalize_rtl433([json.dumps(data)])
            elif decoder == "multimon-ng":
                result = normalize_multimon([data.get("text", "")])
            elif decoder == "rtl_fm":
                result = normalize_fm_rds(data, "", freq_hz)
            else:
                continue

            result["_summary"] = make_decode_summary(result)
            yield result

            await asyncio.sleep(random.uniform(0.1, 0.3))
