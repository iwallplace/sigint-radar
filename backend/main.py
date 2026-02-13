import asyncio
import json
import logging
import os

import websockets

from config import load_config
from database import Database
from signal_cluster import SignalCluster
from scan_engine import ScanEngine
from recorder import SignalRecorder
from decode_runner import decode_file

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("sigint-radar")


class SignalServer:
    def __init__(self):
        self.clients = set()
        self.config = load_config()
        self.db = Database(self.config["database"]["path"])
        self.db.create_tables()
        self.rtlsdr_connected = False
        self.cluster = SignalCluster()
        self.priority_bands = self.config.get("priority_bands", [])

        self.scan_engine = ScanEngine(config=self.config, cluster=self.cluster)
        self.scan_task = None
        self.scanning = False
        self.active_band = None
        self.band_status = {}  # name -> "idle"|"scanning"|"found"|"empty"|"error"

        self.recorder = SignalRecorder(config=self.config)
        self.recording = False
        self._pre_record_bands = None  # bands to resume after recording

        # Initialize band statuses
        for band in self.scan_engine.get_bands_info():
            self.band_status[band["name"]] = "idle"

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
                "bands": self.scan_engine.get_bands_info(),
                "band_status": self.band_status,
                "scanning": self.scanning,
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
            "scan_start": self._handle_scan_start,
            "scan_stop": self._handle_scan_stop,
            "get_bands": self._handle_get_bands,
            "record_start": self._handle_record_start,
            "record_stop": self._handle_record_stop,
            "get_decode_history": self._handle_get_decode_history,
            "re_decode": self._handle_re_decode,
            "toggle_star": self._handle_toggle_star,
            "add_note": self._handle_add_note,
            "delete_record": self._handle_delete_record,
            "get_disk_usage": self._handle_get_disk_usage,
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

    async def _handle_get_bands(self, data, ws):
        await ws.send(json.dumps({
            "type": "bands_list",
            "bands": self.scan_engine.get_bands_info(),
            "band_status": self.band_status,
        }))

    async def _handle_scan_start(self, data, ws):
        bands = data.get("bands", [])
        if not bands:
            await ws.send(json.dumps({
                "type": "error",
                "action": "scan_start",
                "message": "no_bands_selected",
            }))
            return

        # Stop existing scan
        if self.scan_task and not self.scan_task.done():
            self.scan_engine.stop()
            self.scan_task.cancel()
            try:
                await self.scan_task
            except (asyncio.CancelledError, Exception):
                pass

        # Reset band statuses
        for name in self.band_status:
            self.band_status[name] = "idle"

        self.scanning = True
        self.scan_engine = ScanEngine(config=self.config, cluster=self.cluster)
        self.scan_task = asyncio.create_task(self._run_scan(bands))

    async def _handle_scan_stop(self, data, ws):
        if self.scan_task and not self.scan_task.done():
            self.scan_engine.stop()
        self.scanning = False
        self.active_band = None
        await self.broadcast({"type": "scan_stopped"})

    async def _handle_record_start(self, data, ws):
        freq_hz = data.get("freq_hz")
        duration = data.get("duration", 15)
        signal_info = data.get("signal", {})

        if not freq_hz:
            await ws.send(json.dumps({
                "type": "error",
                "action": "record_start",
                "message": "no_frequency",
            }))
            return

        # Stop scanning, remember bands for resume
        self._pre_record_bands = None
        if self.scanning and self.scan_task and not self.scan_task.done():
            self._pre_record_bands = list(self.scan_engine.all_bands.keys())
            self.scan_engine.stop()
            self.scan_task.cancel()
            try:
                await self.scan_task
            except (asyncio.CancelledError, Exception):
                pass
            self.scanning = False
            await self.broadcast({"type": "scan_stopped"})

        self.recording = True
        await self.broadcast({
            "type": "record_started",
            "freq_hz": freq_hz,
            "duration": duration,
        })

        # Run recording pipeline as a background task (non-blocking)
        asyncio.create_task(
            self._run_record_pipeline(freq_hz, duration, signal_info)
        )

    async def _run_record_pipeline(self, freq_hz, duration, signal_info):
        """Background task: record IQ, decode, save to DB, resume scan."""
        sample_rate = self.config.get("rtlsdr", {}).get("sample_rate", 2400000)
        gain = self.config.get("rtlsdr", {}).get("gain", 40)

        # Auto-cleanup if disk is full
        max_disk = self.config.get("recording", {}).get("max_disk_usage_gb", 10)
        self.db.auto_cleanup(max_disk)

        try:
            async for progress in self.recorder.start_recording(
                freq_hz, sample_rate, duration, gain
            ):
                await self.broadcast(progress)

            # Recording done — auto decode
            record = self.recorder.get_last_record()
            if record:
                raw_path = record["raw_path"]
                json_path, decode_result = decode_file(raw_path, freq_hz)

                decode_count = decode_result.get("count", 0)
                protocol = decode_result.get("protocol", "unknown")
                category = decode_result.get("category", "unknown")
                decoder_used = decode_result.get("decoder", "none")
                summary = decode_result.get("_summary", "")

                record_id = self.db.add_decode_record(
                    freq_hz=freq_hz,
                    freq_label=f"{freq_hz / 1e6:.3f} MHz",
                    band_name=signal_info.get("band_name", ""),
                    protocol=protocol,
                    category=category,
                    decoder_used=decoder_used,
                    duration_seconds=record.get("duration_seconds", 0),
                    file_size_bytes=record.get("file_size_bytes", 0),
                    raw_path=raw_path,
                    json_path=json_path,
                    decode_result=json.dumps(decode_result),
                    decode_count=decode_count,
                    power_db=signal_info.get("power_db"),
                    estimated_distance_km=signal_info.get("estimated_distance_km"),
                    weirdness_score=signal_info.get("weirdness_score"),
                )

                await self.broadcast({
                    "type": "record_complete",
                    "record_id": record_id,
                    "freq_hz": freq_hz,
                    "duration_seconds": record.get("duration_seconds", 0),
                    "file_size_bytes": record.get("file_size_bytes", 0),
                    "raw_path": raw_path,
                    "decode_count": decode_count,
                    "protocol": protocol,
                    "category": category,
                    "decoder_used": decoder_used,
                    "summary": summary,
                })

        except Exception as e:
            logger.error("Recording pipeline error: %s", e)
            await self.broadcast({
                "type": "record_error",
                "error": str(e),
            })
        finally:
            self.recording = False

            # Resume scanning if we were scanning before
            if self._pre_record_bands:
                bands = self._pre_record_bands
                self._pre_record_bands = None
                self.scanning = True
                self.scan_engine = ScanEngine(
                    config=self.config, cluster=self.cluster
                )
                self.scan_task = asyncio.create_task(self._run_scan(bands))
                await self.broadcast({"type": "scan_resumed"})

    async def _handle_record_stop(self, data, ws):
        if self.recording:
            self.recorder.stop_recording()

    async def _handle_get_decode_history(self, data, ws):
        try:
            records, total = self.db.get_decode_history(
                limit=data.get("limit", 50),
                offset=data.get("offset", 0),
                category=data.get("category"),
                starred_only=data.get("starred_only", False),
                freq_min=data.get("freq_min"),
                freq_max=data.get("freq_max"),
                search_text=data.get("search_text"),
                date_from=data.get("date_from"),
                date_to=data.get("date_to"),
            )
            disk_usage = self.db.get_disk_usage()
            max_disk = self.config.get("recording", {}).get("max_disk_usage_gb", 10)
            await ws.send(json.dumps({
                "type": "decode_history",
                "records": records,
                "total": total,
                "disk_usage_bytes": disk_usage,
                "max_disk_gb": max_disk,
            }))
        except Exception as e:
            logger.error("Error getting decode history: %s", e)
            await ws.send(json.dumps({
                "type": "error",
                "action": "get_decode_history",
                "message": str(e),
            }))

    async def _handle_toggle_star(self, data, ws):
        try:
            record_id = data.get("record_id")
            if not record_id:
                await ws.send(json.dumps({
                    "type": "error", "action": "toggle_star",
                    "message": "no_record_id",
                }))
                return
            starred = self.db.toggle_star(record_id)
            await ws.send(json.dumps({
                "type": "star_toggled",
                "record_id": record_id,
                "starred": starred,
            }))
        except Exception as e:
            logger.error("Error toggling star: %s", e)
            await ws.send(json.dumps({
                "type": "error", "action": "toggle_star", "message": str(e),
            }))

    async def _handle_add_note(self, data, ws):
        try:
            record_id = data.get("record_id")
            text = data.get("text", "")
            if not record_id:
                await ws.send(json.dumps({
                    "type": "error", "action": "add_note",
                    "message": "no_record_id",
                }))
                return
            ok = self.db.add_note(record_id, text)
            await ws.send(json.dumps({
                "type": "note_added",
                "record_id": record_id,
                "ok": ok,
            }))
        except Exception as e:
            logger.error("Error adding note: %s", e)
            await ws.send(json.dumps({
                "type": "error", "action": "add_note", "message": str(e),
            }))

    async def _handle_delete_record(self, data, ws):
        try:
            record_id = data.get("record_id")
            if not record_id:
                await ws.send(json.dumps({
                    "type": "error", "action": "delete_record",
                    "message": "no_record_id",
                }))
                return
            ok = self.db.delete_record(record_id, delete_files=data.get("delete_files", True))
            await ws.send(json.dumps({
                "type": "record_deleted",
                "record_id": record_id,
                "ok": ok,
            }))
        except Exception as e:
            logger.error("Error deleting record: %s", e)
            await ws.send(json.dumps({
                "type": "error", "action": "delete_record", "message": str(e),
            }))

    async def _handle_re_decode(self, data, ws):
        try:
            record_id = data.get("record_id")
            decoder_override = data.get("decoder")
            if not record_id:
                await ws.send(json.dumps({
                    "type": "error", "action": "re_decode",
                    "message": "no_record_id",
                }))
                return

            record = self.db.get_record(record_id)
            if not record:
                await ws.send(json.dumps({
                    "type": "error", "action": "re_decode",
                    "message": "record_not_found",
                }))
                return

            raw_path = record.get("raw_path")
            freq_hz = record.get("freq_hz")
            if not raw_path or not os.path.isfile(raw_path):
                await ws.send(json.dumps({
                    "type": "error", "action": "re_decode",
                    "message": "raw_file_missing",
                }))
                return

            json_path, decode_result = decode_file(raw_path, freq_hz, decoder_override)
            self.db.update_decode_result(
                record_id,
                json_path=json_path,
                result_json=json.dumps(decode_result),
                protocol=decode_result.get("protocol"),
                category=decode_result.get("category"),
                decoder_used=decode_result.get("decoder"),
                decode_count=decode_result.get("count", 0),
            )
            updated = self.db.get_record(record_id)
            await ws.send(json.dumps({
                "type": "re_decode_complete",
                "record": updated,
            }))
        except Exception as e:
            logger.error("Error re-decoding: %s", e)
            await ws.send(json.dumps({
                "type": "error", "action": "re_decode", "message": str(e),
            }))

    async def _handle_get_disk_usage(self, data, ws):
        try:
            usage = self.db.get_disk_usage()
            max_disk = self.config.get("recording", {}).get("max_disk_usage_gb", 10)
            await ws.send(json.dumps({
                "type": "disk_usage",
                "disk_usage_bytes": usage,
                "max_disk_gb": max_disk,
            }))
        except Exception as e:
            logger.error("Error getting disk usage: %s", e)

    async def _run_scan(self, band_names):
        """Run scan engine and broadcast events."""
        try:
            async for event in self.scan_engine.scan(band_names):
                if event["type"] == "scan_band_active":
                    band = event["band"]
                    # Previous band scanned → mark status
                    if self.active_band and self.active_band != band:
                        prev = self.active_band
                        # Check if we found signals for that band
                        has_signals = any(
                            c["band_name"] == prev
                            for c in self.cluster.get_all().values()
                        )
                        self.band_status[prev] = "found" if has_signals else "empty"

                    self.active_band = band
                    self.band_status[band] = "scanning"
                    await self.broadcast(event)
                    await self.broadcast({
                        "type": "band_status_update",
                        "band_status": self.band_status,
                    })

                elif event["type"] == "signal_new":
                    if self.active_band:
                        self.band_status[self.active_band] = "found"
                    await self.broadcast(event)

                elif event["type"] == "decode_line":
                    await self.broadcast(event)

                elif event["type"] == "signal_update":
                    await self.broadcast(event)

                elif event["type"] == "signal_removed":
                    await self.broadcast({
                        "type": "signal_removed",
                        "signal_id": event["signal_id"],
                    })

                elif event["type"] == "scan_stopped":
                    # Mark last active band
                    if self.active_band:
                        has_signals = any(
                            c["band_name"] == self.active_band
                            for c in self.cluster.get_all().values()
                        )
                        self.band_status[self.active_band] = (
                            "found" if has_signals else "empty"
                        )
                    self.scanning = False
                    self.active_band = None
                    await self.broadcast(event)
                    await self.broadcast({
                        "type": "band_status_update",
                        "band_status": self.band_status,
                    })

        except asyncio.CancelledError:
            logger.info("Scan task cancelled")
        except Exception as e:
            logger.error("Scan error: %s", e)
            self.scanning = False

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
        rtlsdr_cfg = self.config.get("rtlsdr", {})
        source = rtlsdr_cfg.get("source", "usb")

        while True:
            ok = False
            msg = "no device found"

            if source == "rtl_tcp":
                ok, msg = await self._check_rtl_tcp(rtlsdr_cfg)
            else:
                ok, msg = self._check_rtl_usb()

            was_connected = self.rtlsdr_connected
            self.rtlsdr_connected = ok

            if ok and not was_connected:
                logger.info("RTL-SDR %s connected: %s", source, msg)
                await self.broadcast({
                    "type": "rtlsdr_status",
                    "connected": True,
                    "message": msg,
                })
            elif not ok and was_connected:
                logger.info("RTL-SDR %s disconnected: %s", source, msg)
                await self.broadcast({
                    "type": "rtlsdr_status",
                    "connected": False,
                    "message": msg,
                })

            await asyncio.sleep(5)

    def _check_rtl_usb(self):
        """Check USB RTL-SDR availability."""
        try:
            from rtlsdr import RtlSdr
            sdr = RtlSdr()
            sdr.close()
            return True, "USB connected"
        except Exception:
            return False, "no USB device"

    async def _check_rtl_tcp(self, cfg):
        """Check rtl_tcp server availability."""
        import socket
        host = cfg.get("rtl_tcp_host", "host.docker.internal")
        port = cfg.get("rtl_tcp_port", 1234)
        loop = asyncio.get_event_loop()
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(3)
            await loop.run_in_executor(None, sock.connect, (host, port))
            # Read 12-byte header to confirm it's rtl_tcp
            header = await loop.run_in_executor(None, sock.recv, 12)
            sock.close()
            if len(header) >= 4:
                return True, f"rtl_tcp@{host}:{port}"
            return False, f"rtl_tcp@{host}:{port} invalid header"
        except Exception as e:
            return False, f"rtl_tcp@{host}:{port} unreachable"

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

    async def run(self):
        ws_host = self.config["websocket"]["host"]
        ws_port = self.config["websocket"]["port"]
        fake_mode = self.config["scanner"]["fake_mode"]

        logger.info("SIGINT RADAR backend starting on ws://%s:%d", ws_host, ws_port)
        logger.info("Scan engine: fake_mode=%s, region=%s", fake_mode, self.scan_engine.region)

        async with websockets.serve(self.handler, ws_host, ws_port):
            asyncio.create_task(self.check_rtlsdr())
            asyncio.create_task(self.ttl_tick_loop())

            if fake_mode:
                logger.info("Fake mode — auto-starting scan with all enabled bands")
                enabled = [
                    name for name, band in self.scan_engine.all_bands.items()
                    if band.get("enabled", True)
                ]
                self.scanning = True
                self.scan_engine = ScanEngine(config=self.config, cluster=self.cluster)
                self.scan_task = asyncio.create_task(self._run_scan(enabled))

            await asyncio.Future()


if __name__ == "__main__":
    server = SignalServer()
    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        logger.info("Shutting down")
