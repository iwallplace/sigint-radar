"""IQ signal recorder — records raw IQ samples to file."""

import asyncio
import logging
import os
import time
from datetime import datetime

import numpy as np

from file_organizer import create_capture_path

logger = logging.getLogger("sigint-radar")

CAPTURE_DIR = "/app/data/captures"


class SignalRecorder:
    """Records IQ samples from RTL-SDR (USB, rtl_tcp, or fake) to a raw file."""

    def __init__(self, config=None):
        self.config = config or {}
        self._recording = False
        self._last_record = None
        self.fake_mode = self.config.get("scanner", {}).get("fake_mode", True)

    async def start_recording(self, freq_hz, sample_rate, duration_seconds, gain=40,
                               protocol_hint="unknown"):
        """Async generator: record IQ to file, yield progress events.

        Yields:
            {"type": "record_progress", "elapsed_seconds": n, "file_size_mb": x, "max_seconds": d}
        """
        os.makedirs(CAPTURE_DIR, exist_ok=True)

        # Use protocol-based folder structure
        raw_path = create_capture_path(freq_hz, protocol_hint)

        self._recording = True
        self._last_record = None
        start_time = time.time()
        total_bytes = 0

        logger.info(
            "Recording started: %.3f MHz, %ds, file=%s",
            freq_hz / 1e6, duration_seconds, raw_path,
        )

        try:
            with open(raw_path, "wb") as f:
                elapsed = 0
                while self._recording and elapsed < duration_seconds:
                    if self.fake_mode:
                        chunk = self._generate_fake_chunk(freq_hz, sample_rate)
                    else:
                        chunk = await self._read_chunk(freq_hz, sample_rate, gain)

                    if chunk is not None:
                        f.write(chunk)
                        total_bytes += len(chunk)

                    elapsed = time.time() - start_time
                    file_size_mb = total_bytes / (1024 * 1024)

                    yield {
                        "type": "record_progress",
                        "elapsed_seconds": round(elapsed, 1),
                        "file_size_mb": round(file_size_mb, 2),
                        "max_seconds": duration_seconds,
                    }

                    await asyncio.sleep(1.0)

            actual_duration = time.time() - start_time

            self._last_record = {
                "raw_path": raw_path,
                "duration_seconds": round(actual_duration, 1),
                "file_size_bytes": total_bytes,
                "freq_hz": freq_hz,
                "sample_rate": sample_rate,
            }

            logger.info(
                "Recording complete: %.1fs, %.2f MB, %s",
                actual_duration, total_bytes / (1024 * 1024), raw_path,
            )

        except Exception as e:
            logger.error("Recording error: %s", e)
            # Preserve partial file
            if os.path.exists(raw_path) and total_bytes > 0:
                self._last_record = {
                    "raw_path": raw_path,
                    "duration_seconds": round(time.time() - start_time, 1),
                    "file_size_bytes": total_bytes,
                    "freq_hz": freq_hz,
                    "sample_rate": sample_rate,
                    "error": str(e),
                }
            raise
        finally:
            self._recording = False

    def stop_recording(self):
        """Stop the recording loop."""
        self._recording = False

    def get_last_record(self):
        """Return info about the last recording."""
        return self._last_record

    def _generate_fake_chunk(self, freq_hz, sample_rate):
        """Generate 1 second of fake IQ data (uint8 I/Q pairs)."""
        n_samples = int(sample_rate)
        # Generate complex signal with noise
        t = np.arange(n_samples) / sample_rate
        noise = np.random.normal(0, 0.02, n_samples) + 1j * np.random.normal(0, 0.02, n_samples)
        signal = 0.3 * np.exp(2j * np.pi * 1000 * t)
        iq = signal + noise

        # Convert to uint8 interleaved I/Q
        i_data = np.clip((iq.real * 127.5 + 127.5), 0, 255).astype(np.uint8)
        q_data = np.clip((iq.imag * 127.5 + 127.5), 0, 255).astype(np.uint8)
        interleaved = np.empty(n_samples * 2, dtype=np.uint8)
        interleaved[0::2] = i_data
        interleaved[1::2] = q_data
        return interleaved.tobytes()

    async def _read_chunk(self, freq_hz, sample_rate, gain):
        """Read 1 second of IQ from real SDR hardware."""
        rtlsdr_cfg = self.config.get("rtlsdr", {})
        source = rtlsdr_cfg.get("source", "usb")

        if source == "rtl_tcp":
            return await self._read_chunk_tcp(freq_hz, sample_rate, rtlsdr_cfg)
        else:
            return await self._read_chunk_usb(freq_hz, sample_rate, gain)

    async def _read_chunk_usb(self, freq_hz, sample_rate, gain):
        """Read IQ chunk from USB RTL-SDR."""
        try:
            from rtlsdr import RtlSdr
            sdr = RtlSdr()
            sdr.sample_rate = sample_rate
            sdr.center_freq = freq_hz
            sdr.gain = gain

            n_samples = int(sample_rate)
            samples = sdr.read_samples(n_samples)
            sdr.close()

            i_data = np.clip((samples.real * 127.5 + 127.5), 0, 255).astype(np.uint8)
            q_data = np.clip((samples.imag * 127.5 + 127.5), 0, 255).astype(np.uint8)
            interleaved = np.empty(n_samples * 2, dtype=np.uint8)
            interleaved[0::2] = i_data
            interleaved[1::2] = q_data
            return interleaved.tobytes()
        except Exception as e:
            logger.error("USB read chunk error: %s", e)
            return None

    async def _read_chunk_tcp(self, freq_hz, sample_rate, cfg):
        """Read IQ chunk from rtl_tcp."""
        import socket
        import struct

        host = cfg.get("rtl_tcp_host", "host.docker.internal")
        port = cfg.get("rtl_tcp_port", 1234)
        n_bytes = int(sample_rate) * 2
        loop = asyncio.get_event_loop()

        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(5)
            await loop.run_in_executor(None, sock.connect, (host, port))

            # Read 12-byte header
            header = b""
            while len(header) < 12:
                chunk = await loop.run_in_executor(None, sock.recv, 12 - len(header))
                if not chunk:
                    raise ConnectionError("rtl_tcp header read failed")
                header += chunk

            # Set freq and sample rate
            sock.sendall(struct.pack(">BI", 0x01, int(freq_hz)))
            sock.sendall(struct.pack(">BI", 0x02, int(sample_rate)))
            await asyncio.sleep(0.05)

            # Read IQ data
            buf = bytearray()
            while len(buf) < n_bytes:
                remaining = n_bytes - len(buf)
                chunk = await loop.run_in_executor(
                    None, sock.recv, min(remaining, 65536)
                )
                if not chunk:
                    break
                buf.extend(chunk)

            sock.close()
            return bytes(buf)
        except Exception as e:
            logger.error("rtl_tcp read chunk error: %s", e)
            return None
