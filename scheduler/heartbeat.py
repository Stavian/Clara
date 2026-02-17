import logging
import asyncio
from datetime import datetime

logger = logging.getLogger(__name__)


class Heartbeat:
    def __init__(self, engine, event_bus=None, notification_service=None, db=None):
        self.engine = engine
        self.event_bus = event_bus
        self.notification_service = notification_service
        self.db = db
        self._task: asyncio.Task | None = None

    async def start(self, interval_minutes: int = 5):
        self._task = asyncio.create_task(self._loop(interval_minutes))
        logger.info(f"Heartbeat started (interval: {interval_minutes}min)")

    async def _loop(self, interval_minutes: int):
        while True:
            try:
                await asyncio.sleep(interval_minutes * 60)
                logger.info(f"Heartbeat tick: {datetime.now().isoformat()}")

                # Emit heartbeat event
                if self.event_bus:
                    from automation.event_bus import Event
                    await self.event_bus.emit(Event(
                        type="heartbeat",
                        source="system:heartbeat",
                        data={"scheduler_running": self.engine.scheduler.running},
                    ))

                # Run proactive checks
                await self._check_overdue_tasks()

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Heartbeat error: {e}")

    async def _check_overdue_tasks(self):
        if not self.db:
            return
        try:
            now = datetime.now().isoformat()
            rows = await self.db.fetchall(
                "SELECT title, due_date FROM tasks WHERE due_date < ? AND status != 'done'",
                (now,),
            )
            if rows and self.notification_service:
                task_list = "\n".join(
                    f"- {r['title']} (faellig: {r['due_date']})" for r in rows
                )
                await self.notification_service.notify(
                    f"Du hast {len(rows)} ueberfaellige Aufgabe(n):\n{task_list}"
                )
        except Exception:
            logger.exception("Heartbeat: overdue tasks check failed")

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
