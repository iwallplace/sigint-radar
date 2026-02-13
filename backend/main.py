import asyncio
import json
import logging

import websockets

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("sigint-radar")

CLIENTS = set()


async def handler(websocket):
    CLIENTS.add(websocket)
    remote = websocket.remote_address
    logger.info("Client connected: %s:%s", remote[0], remote[1])

    try:
        await websocket.send(json.dumps({
            "type": "connection_status",
            "rtlsdr_connected": False,
            "message": "Faz 1 skeleton",
        }))

        async for message in websocket:
            try:
                data = json.loads(message)
                logger.info("Received: %s", data.get("type", "unknown"))
            except json.JSONDecodeError:
                logger.warning("Invalid JSON from client")
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        CLIENTS.discard(websocket)
        logger.info("Client disconnected: %s:%s", remote[0], remote[1])


async def main():
    logger.info("SIGINT RADAR backend starting on ws://0.0.0.0:8765")
    async with websockets.serve(handler, "0.0.0.0", 8765):
        await asyncio.Future()


if __name__ == "__main__":
    main_loop = asyncio.new_event_loop()
    try:
        main_loop.run_until_complete(main())
    except KeyboardInterrupt:
        logger.info("Shutting down")
    finally:
        main_loop.close()
