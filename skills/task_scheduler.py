import logging
from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)


class TaskSchedulerSkill(BaseSkill):
    def __init__(self, engine):
        self.engine = engine

    @property
    def name(self) -> str:
        return "task_scheduler"

    @property
    def description(self) -> str:
        return "Plant und verwaltet zeitgesteuerte Aufgaben (Cron-Jobs, Erinnerungen, wiederkehrende Tasks)."

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["add", "list", "remove"],
                    "description": "Aktion: add, list, oder remove",
                },
                "name": {
                    "type": "string",
                    "description": "Name der Aufgabe",
                },
                "cron": {
                    "type": "string",
                    "description": "Cron-Ausdruck (z.B. '0 9 * * *' fuer taeglich um 9 Uhr). Nur bei action=add.",
                },
                "command": {
                    "type": "string",
                    "description": "Auszufuehrender Befehl oder Nachricht. Nur bei action=add.",
                },
            },
            "required": ["action"],
        }

    async def execute(self, action: str, name: str = "", cron: str = "", command: str = "", **kwargs) -> str:
        try:
            if action == "add":
                if not name or not cron or not command:
                    return "Fehler: 'name', 'cron' und 'command' sind erforderlich."
                result = await self.engine.add_job(name, cron, command)
                return result

            elif action == "list":
                jobs = await self.engine.list_jobs()
                if not jobs:
                    return "Keine geplanten Aufgaben vorhanden."
                lines = [f"- **{j['name']}**: `{j['cron']}` -> {j['command']}" for j in jobs]
                return "Geplante Aufgaben:\n" + "\n".join(lines)

            elif action == "remove":
                if not name:
                    return "Fehler: 'name' ist erforderlich."
                result = await self.engine.remove_job(name)
                return result

            else:
                return f"Unbekannte Aktion: {action}"

        except Exception as e:
            logger.exception("task_scheduler failed")
            return f"Fehler: {e}"
