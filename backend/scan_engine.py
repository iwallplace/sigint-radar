"""Band scanning engine for RTL-SDR (USB direct or rtl_tcp)."""

import asyncio
import logging
import random
import socket
import struct
import time

import numpy as np

from config import load_config
from signal_detector import SignalDetector
from signal_cluster import SignalCluster
from distance_estimator import estimate_distance_km
from weirdness_scorer import calculate_weirdness
from regions import detect_region, load_bands
from decoder_manager import DecoderManager, select_decoder
from decode_normalizer import make_decode_summary

logger = logging.getLogger("sigint-radar")

# Sample rate and sweep count per band from CLAUDE.md BAND_SR table
BAND_SR = {
    "fm_broadcast": (2.4e6, 9),
    "aviation": (2.4e6, 5),
    "weather_sat": (2.4e6, 1),
    "ism_433": (2.4e6, 1),
    "ism_868": (2.4e6, 2),
    "ism_915": (2.4e6, 11),
    "adsb": (2.4e6, 1),
    "tetra": (2.4e6, 9),
    "pmr446": (1e6, 1),
    "pager": (2.4e6, 9),
    "marine": (2.4e6, 3),
    "radiosonde": (2.4e6, 3),
    "lband_sat": (2.4e6, 9),
    "gsm900": (2.4e6, 11),
}

DEFAULT_SR = (2.4e6, 1)

PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}


class ScanEngine:
    """Sequential band scanner using RTL-SDR or fake IQ data."""

    def __init__(self, config=None, cluster=None):
        self.config = config or load_config()
        self.fake_mode = self.config["scanner"].get("fake_mode", True)

        station = self.config.get("station", {})
        lat = station.get("lat", 0.0)
        lon = station.get("lon", 0.0)

        region_cfg = self.config.get("region", {})
        profile = region_cfg.get("profile", "auto")
        if profile == "auto":
            self.region = detect_region(lat, lon)
        else:
            self.region = profile

        band_config = self.config.get("bands", {})
        self.all_bands = load_bands(self.region, band_config)
        self.priority_bands = self.config.get("priority_bands", [])

        scanner_cfg = self.config.get("scanner", {})
        self.detector = SignalDetector(
            fft_size=scanner_cfg.get("fft_size", 2048),
            fft_averages=scanner_cfg.get("fft_averages", 16),
            threshold_db=scanner_cfg.get("signal_threshold_db", 10),
        )
        self.cluster = cluster or SignalCluster()
        self.cycle_delay = scanner_cfg.get("cycle_delay_ms", 500) / 1000.0

        self.running = False
        self._sdr = None
        self._tcp_sock = None
        self.decoder_manager = DecoderManager(config=self.config)

        rtlsdr_cfg = self.config.get("rtlsdr", {})
        self.sdr_source = rtlsdr_cfg.get("source", "usb")
        self.tcp_host = rtlsdr_cfg.get("rtl_tcp_host", "host.docker.internal")
        self.tcp_port = rtlsdr_cfg.get("rtl_tcp_port", 1234)

    def get_bands_info(self):
        """Return band metadata for frontend display."""
        result = []
        for name, band in self.all_bands.items():
            result.append({
                "name": name,
                "description": band.get("description", name),
                "category": band.get("category", "unknown"),
                "priority": band.get("priority", "low"),
                "enabled": band.get("enabled", True),
                "decoder": band.get("decoder"),
                "center_mhz": band["center_hz"] / 1e6,
                "bandwidth_mhz": band["bandwidth_hz"] / 1e6,
            })
        return result

    async def scan(self, selected_band_names):
        """Async generator: scan selected bands in priority order.

        Yields dicts: signal_new, signal_update, signal_removed,
        scan_band_active, scan_stopped.
        """
        self.running = True

        # Filter and sort by priority
        bands = []
        for name in selected_band_names:
            if name in self.all_bands:
                bands.append((name, self.all_bands[name]))

        bands.sort(key=lambda x: PRIORITY_ORDER.get(x[1].get("priority", "low"), 2))

        logger.info(
            "Scan started: %d bands selected [%s]",
            len(bands),
            ", ".join(b[0] for b in bands),
        )

        last_tick = time.time()

        while self.running:
            for idx, (name, band) in enumerate(bands):
                if not self.running:
                    break

                # Notify frontend which band is being scanned
                yield {
                    "type": "scan_band_active",
                    "band": name,
                    "index": idx,
                    "total": len(bands),
                }

                # Scan the band
                async for event in self._scan_band(name, band):
                    yield event

                # TTL tick check (every ~1 second)
                now = time.time()
                if now - last_tick >= 1.0:
                    expired = self.cluster.tick()
                    for cid in expired:
                        yield {"type": "signal_removed", "signal_id": cid}
                    last_tick = now

                if not self.running:
                    break

                await asyncio.sleep(self.cycle_delay)

        yield {"type": "scan_stopped"}
        logger.info("Scan stopped")

    async def _scan_band(self, name, band):
        """Scan a single band. Yields signal events + decode events."""
        sample_rate, sweep_count = BAND_SR.get(name, DEFAULT_SR)
        center_hz = band["center_hz"]
        bandwidth_hz = band["bandwidth_hz"]

        # Multi-sweep: split wide bands into 2.4MHz chunks
        chunk_size = sample_rate
        half_bw = bandwidth_hz / 2
        start_freq = center_hz - half_bw
        end_freq = center_hz + half_bw

        sweep_centers = []
        if bandwidth_hz <= chunk_size:
            sweep_centers = [center_hz]
        else:
            f = start_freq + chunk_size / 2
            while f < end_freq:
                sweep_centers.append(f)
                f += chunk_size
            if not sweep_centers:
                sweep_centers = [center_hz]

        # Limit to sweep_count
        sweep_centers = sweep_centers[:sweep_count]

        for sweep_freq in sweep_centers:
            if not self.running:
                return

            try:
                iq_samples = await self._read_samples(sweep_freq, sample_rate)
                if iq_samples is None:
                    continue

                detected = self.detector.detect_signals(
                    iq_samples, sweep_freq, sample_rate
                )

                # Emit spectrum data for waterfall display
                try:
                    fft_size = self.detector.fft_size
                    spectrum = np.fft.fftshift(np.fft.fft(iq_samples[:fft_size]))
                    power_db_arr = 20 * np.log10(np.abs(spectrum) + 1e-12)
                    freqs_arr = np.linspace(
                        sweep_freq - sample_rate / 2,
                        sweep_freq + sample_rate / 2,
                        fft_size,
                    )
                    # Downsample to 256 bins for efficiency
                    n_bins = 256
                    step = max(1, len(freqs_arr) // n_bins)
                    yield {
                        "type": "spectrum",
                        "band": name,
                        "center_hz": sweep_freq,
                        "sample_rate": sample_rate,
                        "freqs": freqs_arr[::step].tolist(),
                        "power_db": power_db_arr[::step].tolist(),
                    }
                except Exception:
                    pass

                for peak_freq, peak_power, bw, snr in detected:
                    freq_mhz = peak_freq / 1e6
                    distance = estimate_distance_km(
                        freq_mhz, peak_power, category=band.get("category", "unknown")
                    )

                    sig = {
                        "freq_hz": peak_freq,
                        "band_name": name,
                        "protocol": band.get("decoder") or "unknown",
                        "category": band.get("category", "unknown"),
                        "power_db": peak_power,
                        "snr_db": snr,
                        "estimated_distance_km": distance,
                    }

                    # Run live decode if decoder exists for this freq
                    has_decoder = select_decoder(peak_freq) is not None
                    if has_decoder:
                        async for decode_result in self.decoder_manager.start_live_decode(
                            peak_freq, name
                        ):
                            if decode_result and decode_result.get("count", 0) > 0:
                                sig["protocol"] = decode_result.get("protocol", sig["protocol"])
                                sig["category"] = decode_result.get("category", sig["category"])
                                sig["decode_summary"] = decode_result.get("_summary", "")

                                yield {
                                    "type": "decode_line",
                                    "decoder": decode_result.get("decoder"),
                                    "protocol": decode_result.get("protocol"),
                                    "summary": decode_result.get("_summary", ""),
                                    "count": decode_result.get("count", 0),
                                    "band": name,
                                }

                    sig["weirdness_score"] = calculate_weirdness(
                        sig, self.priority_bands
                    )

                    cid, is_new = self.cluster.add_signal(sig)
                    cluster = self.cluster.get_cluster(cid)

                    if is_new:
                        yield {"type": "signal_new", "signal": cluster}
                    else:
                        yield {"type": "signal_update", "signal": cluster}

            except Exception as e:
                logger.error("Error scanning %s at %.3f MHz: %s", name, sweep_freq / 1e6, e)

    async def _read_samples(self, center_freq, sample_rate):
        """Read IQ samples from RTL-SDR (USB or rtl_tcp) or generate fake data."""
        if self.fake_mode:
            return self._generate_fake_iq(center_freq, sample_rate)

        if self.sdr_source == "rtl_tcp":
            return await self._read_samples_tcp(center_freq, sample_rate)
        else:
            return await self._read_samples_usb(center_freq, sample_rate)

    async def _read_samples_usb(self, center_freq, sample_rate):
        """Read IQ samples via direct USB (pyrtlsdr)."""
        try:
            if self._sdr is None:
                from rtlsdr import RtlSdr

                self._sdr = RtlSdr()
                rtlsdr_cfg = self.config.get("rtlsdr", {})
                self._sdr.sample_rate = sample_rate
                self._sdr.gain = rtlsdr_cfg.get("gain", 40)
                if rtlsdr_cfg.get("bias_tee", False):
                    try:
                        self._sdr.set_bias_tee(True)
                    except Exception:
                        pass

            self._sdr.center_freq = center_freq
            self._sdr.sample_rate = sample_rate

            await asyncio.sleep(0.05)
            samples = self._sdr.read_samples(256 * 1024)
            return samples

        except Exception as e:
            logger.error("RTL-SDR USB read error: %s", e)
            if self._sdr:
                try:
                    self._sdr.close()
                except Exception:
                    pass
                self._sdr = None
            return None

    async def _read_samples_tcp(self, center_freq, sample_rate):
        """Read IQ samples via rtl_tcp network protocol."""
        n_bytes = 256 * 1024 * 2  # I+Q uint8 pairs
        loop = asyncio.get_event_loop()

        try:
            if self._tcp_sock is None:
                self._tcp_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self._tcp_sock.settimeout(5)
                await loop.run_in_executor(
                    None, self._tcp_sock.connect, (self.tcp_host, self.tcp_port)
                )

                # Read 12-byte dongle info header
                header = b""
                while len(header) < 12:
                    chunk = await loop.run_in_executor(
                        None, self._tcp_sock.recv, 12 - len(header)
                    )
                    if not chunk:
                        raise ConnectionError("rtl_tcp header read failed")
                    header += chunk

                logger.info(
                    "rtl_tcp connected to %s:%d (dongle: %s)",
                    self.tcp_host,
                    self.tcp_port,
                    header[:4].decode("ascii", errors="replace"),
                )

                # Set gain
                rtlsdr_cfg = self.config.get("rtlsdr", {})
                gain = int(rtlsdr_cfg.get("gain", 40) * 10)
                # cmd 0x04 = set gain mode (manual=1)
                self._tcp_send_cmd(0x03, 1)
                # cmd 0x04 = set gain
                self._tcp_send_cmd(0x04, gain)

            # Set frequency: cmd 0x01
            self._tcp_send_cmd(0x01, int(center_freq))
            # Set sample rate: cmd 0x02
            self._tcp_send_cmd(0x02, int(sample_rate))

            await asyncio.sleep(0.05)

            # Read IQ data
            buf = bytearray()
            while len(buf) < n_bytes:
                remaining = n_bytes - len(buf)
                chunk = await loop.run_in_executor(
                    None, self._tcp_sock.recv, min(remaining, 65536)
                )
                if not chunk:
                    raise ConnectionError("rtl_tcp data stream ended")
                buf.extend(chunk)

            # Convert uint8 IQ to complex float
            raw = np.frombuffer(buf, dtype=np.uint8)
            iq = raw.astype(np.float32).view(np.float32)
            i_data = (iq[0::2] - 127.5) / 127.5
            q_data = (iq[1::2] - 127.5) / 127.5
            return i_data + 1j * q_data

        except Exception as e:
            logger.error("rtl_tcp read error: %s", e)
            self._close_tcp()
            return None

    def _tcp_send_cmd(self, cmd, param):
        """Send a 5-byte command to rtl_tcp (1-byte cmd + 4-byte big-endian param)."""
        if self._tcp_sock:
            data = struct.pack(">BI", cmd, param & 0xFFFFFFFF)
            self._tcp_sock.sendall(data)

    def _close_tcp(self):
        """Close rtl_tcp socket."""
        if self._tcp_sock:
            try:
                self._tcp_sock.close()
            except Exception:
                pass
            self._tcp_sock = None

    def _generate_fake_iq(self, center_freq, sample_rate):
        """Generate synthetic IQ samples with random signals."""
        n_samples = 256 * 1024
        t = np.arange(n_samples) / sample_rate

        # Noise floor
        noise = (
            np.random.normal(0, 0.01, n_samples)
            + 1j * np.random.normal(0, 0.01, n_samples)
        )

        # Random chance of a signal
        if random.random() < 0.4:
            offset = random.uniform(-sample_rate / 4, sample_rate / 4)
            amplitude = random.uniform(0.05, 0.5)
            signal = amplitude * np.exp(2j * np.pi * offset * t)
            noise += signal

        return noise

    def stop(self):
        """Stop the scan loop."""
        self.running = False
        if self._sdr:
            try:
                self._sdr.close()
            except Exception:
                pass
            self._sdr = None
        self._close_tcp()
        asyncio.ensure_future(self.decoder_manager.stop_live_decode())
        logger.info("Scan engine stop requested")
