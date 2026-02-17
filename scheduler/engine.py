import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)


class SchedulerEngine:
    def __init__(self, db=None, event_bus=None):
        self.scheduler = AsyncIOScheduler()
        self._jobs: dict[str, dict] = {}
        self.db = db
        self.event_bus = event_bus
        self.skill_registry = None
        self.notification_service = None

    async def start(self):
        self.scheduler.start()
        if self.db:
            await self._create_table()
            await self._load_persisted_jobs()
        logger.info("Scheduler engine started")

    async def _create_table(self):
        await self.db.execute("""
            CREATE TABLE IF NOT EXISTS scheduled_jobs (
                name TEXT PRIMARY KEY,
                cron TEXT NOT NULL,
                command TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)

    async def _load_persisted_jobs(self):
        rows = await self.db.fetchall("SELECT name, cron, command FROM scheduled_jobs")
        for r in rows:
            await self.add_job(r["name"], r["cron"], r["command"], persist=False)
        if rows:
            logger.info(f"Loaded {len(rows)} persisted jobs")

    async def stop(self):
        self.scheduler.shutdown(wait=False)
        logger.info("Scheduler engine stopped")

    async def add_job(self, name: str, cron: str, command: str, persist: bool = True) -> str:
        if name in self._jobs:
            return f"Aufgabe '{name}' existiert bereits."

        try:
            parts = cron.strip().split()
            if len(parts) != 5:
                return "Fehler: Cron-Ausdruck muss 5 Felder haben (Minute Stunde Tag Monat Wochentag)."

            trigger = CronTrigger(
                minute=parts[0],
                hour=parts[1],
                day=parts[2],
                month=parts[3],
                day_of_week=parts[4],
            )

            def job_func():
                asyncio.get_event_loop().create_task(self._execute_job(name, command))

            self.scheduler.add_job(job_func, trigger, id=name, name=name)
            self._jobs[name] = {"name": name, "cron": cron, "command": command}

            if persist and self.db:
                await self.db.execute(
                    "INSERT OR REPLACE INTO scheduled_jobs (name, cron, command) VALUES (?,?,?)",
                    (name, cron, command),
                )

            return f"Aufgabe '{name}' geplant mit Cron '{cron}'."

        except Exception as e:
            return f"Fehler beim Planen: {e}"

    async def _execute_job(self, name: str, command: str):
        logger.info(f"Scheduled job '{name}' triggered: {command}")

        # Emit event on the bus
        if self.event_bus:
            from automation.event_bus import Event
            await self.event_bus.emit(Event(
                type="schedule_triggered",
                source=f"scheduler:{name}",
                data={"command": command, "job_name": name},
            ))

        # Execute as system_command skill
        if self.skill_registry:
            try:
                result = await self.skill_registry.execute("system_command", command=command)
                logger.info(f"Job '{name}' result: {result[:200]}")
                if self.notification_service:
                    await self.notification_service.notify(
                        f"Geplante Aufgabe '{name}' ausgefuehrt:\n{result[:500]}"
                    )
            except Exception:
                logger.exception(f"Job '{name}' execution failed")

    async def list_jobs(self) -> list[dict]:
        return list(self._jobs.values())

    async def remove_job(self, name: str) -> str:
        if name not in self._jobs:
            return f"Aufgabe '{name}' nicht gefunden."
        try:
            self.scheduler.remove_job(name)
        except Exception:
            pass
        del self._jobs[name]
        if self.db:
            await self.db.execute("DELETE FROM scheduled_jobs WHERE name = ?", (name,))
        return f"Aufgabe '{name}' entfernt."
