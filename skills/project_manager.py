import logging
from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)


class ProjectManagerSkill(BaseSkill):
    def __init__(self, store):
        self.store = store

    @property
    def name(self) -> str:
        return "project_manager"

    @property
    def description(self) -> str:
        return "Verwaltet Projekte und Aufgaben: Erstellen, Auflisten, Aktualisieren und Loeschen von Projekten und Tasks."

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["create_project", "list_projects", "add_task", "list_tasks", "update_task", "delete_project"],
                    "description": "Die auszufuehrende Aktion",
                },
                "name": {
                    "type": "string",
                    "description": "Projektname",
                },
                "description": {
                    "type": "string",
                    "description": "Beschreibung (fuer Projekte oder Tasks)",
                },
                "title": {
                    "type": "string",
                    "description": "Task-Titel (nur bei add_task)",
                },
                "task_id": {
                    "type": "integer",
                    "description": "Task-ID (nur bei update_task)",
                },
                "status": {
                    "type": "string",
                    "description": "Neuer Status (nur bei update_task)",
                },
            },
            "required": ["action"],
        }

    async def execute(self, action: str, **kwargs) -> str:
        try:
            if action == "create_project":
                name = kwargs.get("name", "")
                desc = kwargs.get("description", "")
                if not name:
                    return "Fehler: Projektname ist erforderlich."
                project = await self.store.create_project(name, desc)
                return f"Projekt '{project['name']}' erstellt (ID: {project['id']})."

            elif action == "list_projects":
                projects = await self.store.list_projects()
                if not projects:
                    return "Keine Projekte vorhanden."
                lines = []
                for p in projects:
                    lines.append(f"- **{p['name']}** [{p['status']}]: {p.get('description', '')}")
                return "Projekte:\n" + "\n".join(lines)

            elif action == "add_task":
                name = kwargs.get("name", "")
                title = kwargs.get("title", "")
                desc = kwargs.get("description", "")
                if not name or not title:
                    return "Fehler: 'name' (Projekt) und 'title' (Task) sind erforderlich."
                task = await self.store.add_task(name, title, desc)
                if not task:
                    return f"Projekt '{name}' nicht gefunden."
                return f"Task '{task['title']}' hinzugefuegt (ID: {task['id']})."

            elif action == "list_tasks":
                name = kwargs.get("name", "")
                if not name:
                    return "Fehler: Projektname ist erforderlich."
                tasks = await self.store.list_tasks(name)
                if not tasks:
                    return f"Keine Tasks im Projekt '{name}'."
                lines = []
                for t in tasks:
                    lines.append(f"- [{t['status']}] {t['title']} (ID: {t['id']})")
                return f"Tasks in '{name}':\n" + "\n".join(lines)

            elif action == "update_task":
                task_id = kwargs.get("task_id")
                status = kwargs.get("status", "")
                if not task_id or not status:
                    return "Fehler: 'task_id' und 'status' sind erforderlich."
                await self.store.update_task(task_id, status)
                return f"Task {task_id} auf '{status}' gesetzt."

            elif action == "delete_project":
                name = kwargs.get("name", "")
                if not name:
                    return "Fehler: Projektname ist erforderlich."
                deleted = await self.store.delete_project(name)
                return f"Projekt '{name}' geloescht." if deleted else f"Projekt '{name}' nicht gefunden."

            else:
                return f"Unbekannte Aktion: {action}"

        except Exception as e:
            logger.exception("project_manager failed")
            return f"Fehler: {e}"
