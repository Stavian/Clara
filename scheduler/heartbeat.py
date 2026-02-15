import logging
import asyncio
from datetime import datetime

logger = logging.getLogger(__name__)


class Heartbeat:
    def __init__(self, engine):
        self.engine = engine
        self._task: asyncio.Task | None = None

    async def start(self, interval_minutes: int = 5):
        self._task = asyncio.create_task(self._loop(interval_minutes))
        logger.info(f"Heartbeat started (interval: {interval_minutes}min)")

    async def _loop(self, interval_minutes: int):
        while True:
            try:
                await asyncio.sleep(interval_minutes * 60)
                logger.debug(f"Heartbeat: {datetime.now().isoformat()} - Scheduler running")
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Heartbeat error: {e}")

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
