import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)


class SchedulerEngine:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self._jobs: dict[str, dict] = {}

    async def start(self):
        self.scheduler.start()
        logger.info("Scheduler engine started")

    async def stop(self):
        self.scheduler.shutdown(wait=False)
        logger.info("Scheduler engine stopped")

    async def add_job(self, name: str, cron: str, command: str) -> str:
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
                logger.info(f"Scheduled job '{name}' triggered: {command}")

            job = self.scheduler.add_job(job_func, trigger, id=name, name=name)
            self._jobs[name] = {"name": name, "cron": cron, "command": command}
            return f"Aufgabe '{name}' geplant mit Cron '{cron}'."

        except Exception as e:
            return f"Fehler beim Planen: {e}"

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
        return f"Aufgabe '{name}' entfernt."
