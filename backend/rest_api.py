"""REST API server for SIGINT RADAR — aiohttp on port 8080."""

import json
import logging
import os
import time

from aiohttp import web

logger = logging.getLogger("sigint-radar")


def create_app(server):
    """Create aiohttp application with all routes.

    Args:
        server: SignalServer instance with access to config, cluster, db, etc.
    """
    app = web.Application(middlewares=[cors_middleware])
    app["server"] = server
    app["start_time"] = time.time()

    app.router.add_get("/api/status", handle_status)
    app.router.add_get("/api/signals", handle_signals)
    app.router.add_get("/api/signals/{signal_id}", handle_signal_detail)
    app.router.add_get("/api/history", handle_history)
    app.router.add_get("/api/history/{record_id}", handle_history_detail)
    app.router.add_get("/api/history/{record_id}/raw", handle_history_raw)
    app.router.add_get("/api/history/{record_id}/json", handle_history_json)
    app.router.add_get("/api/bands", handle_bands)
    app.router.add_get("/api/config", handle_config)
    app.router.add_post("/api/scan/start", handle_scan_start)
    app.router.add_post("/api/scan/stop", handle_scan_stop)
    app.router.add_post("/api/record", handle_record_start)
    app.router.add_get("/api/spectrum", handle_spectrum)

    return app


@web.middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS":
        resp = web.Response()
    else:
        resp = await handler(request)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


async def handle_status(request):
    srv = request.app["server"]
    uptime = time.time() - request.app["start_time"]
    return web.json_response({
        "rtlsdr_connected": srv.rtlsdr_connected,
        "scanning": srv.scanning,
        "active_band": srv.active_band,
        "signal_count": len(srv.cluster.get_all()),
        "uptime_seconds": round(uptime, 1),
        "recording": srv.recording,
        "region": srv.config.get("region", {}).get("profile", "auto"),
        "station": srv.config.get("station", {}).get("name", ""),
    })


async def handle_signals(request):
    srv = request.app["server"]
    signals = list(srv.cluster.get_all().values())
    return web.json_response(signals)


async def handle_signal_detail(request):
    srv = request.app["server"]
    signal_id = request.match_info["signal_id"]
    cluster = srv.cluster.get_cluster(signal_id)
    if not cluster:
        raise web.HTTPNotFound(text=json.dumps({"error": "signal_not_found"}))
    return web.json_response(cluster)


async def handle_history(request):
    srv = request.app["server"]
    limit = int(request.query.get("limit", 50))
    offset = int(request.query.get("offset", 0))
    category = request.query.get("category")
    starred = request.query.get("starred", "").lower() == "true"
    freq_min = request.query.get("freq_min")
    freq_max = request.query.get("freq_max")

    if freq_min is not None:
        freq_min = float(freq_min)
    if freq_max is not None:
        freq_max = float(freq_max)

    records, total = srv.db.get_decode_history(
        limit=limit,
        offset=offset,
        category=category,
        starred_only=starred,
        freq_min=freq_min,
        freq_max=freq_max,
    )
    return web.json_response({
        "records": records,
        "total": total,
        "limit": limit,
        "offset": offset,
    })


async def handle_history_detail(request):
    srv = request.app["server"]
    record_id = int(request.match_info["record_id"])
    record = srv.db.get_record(record_id)
    if not record:
        raise web.HTTPNotFound(text=json.dumps({"error": "record_not_found"}))
    return web.json_response(record)


async def handle_history_raw(request):
    srv = request.app["server"]
    record_id = int(request.match_info["record_id"])
    record = srv.db.get_record(record_id)
    if not record:
        raise web.HTTPNotFound(text=json.dumps({"error": "record_not_found"}))

    raw_path = record.get("raw_path")
    if not raw_path or not os.path.isfile(raw_path):
        raise web.HTTPNotFound(text=json.dumps({"error": "raw_file_missing"}))

    return web.FileResponse(
        raw_path,
        headers={
            "Content-Disposition": f'attachment; filename="record_{record_id}.raw"',
            "Content-Type": "application/octet-stream",
        },
    )


async def handle_history_json(request):
    srv = request.app["server"]
    record_id = int(request.match_info["record_id"])
    record = srv.db.get_record(record_id)
    if not record:
        raise web.HTTPNotFound(text=json.dumps({"error": "record_not_found"}))

    json_path = record.get("json_path")
    if not json_path or not os.path.isfile(json_path):
        # Return decode_result from DB
        result_str = record.get("decode_result", "{}")
        try:
            result = json.loads(result_str)
        except (json.JSONDecodeError, TypeError):
            result = {"raw": result_str}
        return web.json_response(result)

    return web.FileResponse(
        json_path,
        headers={
            "Content-Disposition": f'attachment; filename="record_{record_id}.json"',
            "Content-Type": "application/json",
        },
    )


async def handle_bands(request):
    srv = request.app["server"]
    return web.json_response({
        "bands": srv.scan_engine.get_bands_info(),
        "band_status": srv.band_status,
    })


async def handle_config(request):
    srv = request.app["server"]
    # Return config without sensitive info
    return web.json_response({
        "scanner": srv.config.get("scanner", {}),
        "ui": srv.config.get("ui", {}),
        "alerts": srv.config.get("alerts", {}),
        "recording": srv.config.get("recording", {}),
        "station": srv.config.get("station", {}),
        "region": srv.config.get("region", {}),
        "rtlsdr": {
            "gain": srv.config.get("rtlsdr", {}).get("gain"),
            "sample_rate": srv.config.get("rtlsdr", {}).get("sample_rate"),
            "ppm_correction": srv.config.get("rtlsdr", {}).get("ppm_correction"),
            "bias_tee": srv.config.get("rtlsdr", {}).get("bias_tee"),
            "source": srv.config.get("rtlsdr", {}).get("source"),
        },
    })


async def handle_scan_start(request):
    srv = request.app["server"]
    try:
        body = await request.json()
    except Exception:
        body = {}

    bands = body.get("bands", [])
    if not bands:
        # Default: all enabled bands
        bands = [
            name for name, band in srv.scan_engine.all_bands.items()
            if band.get("enabled", True)
        ]

    await srv._handle_scan_start({"type": "scan_start", "bands": bands}, None)
    return web.json_response({"status": "started", "bands": bands})


async def handle_scan_stop(request):
    srv = request.app["server"]
    await srv._handle_scan_stop({"type": "scan_stop"}, None)
    return web.json_response({"status": "stopped"})


async def handle_record_start(request):
    srv = request.app["server"]
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid_json"}, status=400)

    freq_hz = body.get("freq_hz")
    duration = body.get("duration_seconds", 15)

    if not freq_hz:
        return web.json_response({"error": "freq_hz_required"}, status=400)

    await srv._handle_record_start({
        "type": "record_start",
        "freq_hz": freq_hz,
        "duration": duration,
        "signal": body.get("signal", {}),
    }, None)

    return web.json_response({
        "status": "recording_started",
        "freq_hz": freq_hz,
        "duration": duration,
    })


async def handle_spectrum(request):
    """Return the latest spectrum data if available."""
    srv = request.app["server"]
    spectrum = getattr(srv, "last_spectrum", None)
    if spectrum:
        return web.json_response(spectrum)
    return web.json_response({"band": None, "freqs": [], "power_db": []})


async def start_rest_api(server):
    """Start the REST API server as an asyncio task."""
    rest_cfg = server.config.get("rest_api", {})
    host = rest_cfg.get("host", "0.0.0.0")
    port = rest_cfg.get("port", 8080)

    app = create_app(server)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    logger.info("REST API started on http://%s:%d", host, port)
