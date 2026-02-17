import json
import logging
from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)


class BatchScriptSkill(BaseSkill):
    def __init__(self, script_engine):
        self.engine = script_engine

    @property
    def name(self) -> str:
        return "batch_script"

    @property
    def description(self) -> str:
        return "Erstellt und fuehrt Batch-Skripte aus (Sequenzen von Skill-Aufrufen als wiederverwendbare Workflows)."

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["create", "list", "show", "run", "delete"],
                    "description": "Aktion: create, list, show, run, oder delete",
                },
                "name": {
                    "type": "string",
                    "description": "Name des Skripts",
                },
                "description": {
                    "type": "string",
                    "description": "Beschreibung des Skripts (nur bei create)",
                },
                "steps": {
                    "type": "string",
                    "description": "JSON-Array der Schritte, z.B. [{\"skill\":\"system_command\",\"args\":{\"command\":\"echo hi\"}}] (nur bei create)",
                },
                "variables": {
                    "type": "string",
                    "description": "JSON-Objekt mit Variablen fuer die Ausfuehrung, z.B. {\"name\":\"test\"} (nur bei run)",
                },
            },
            "required": ["action"],
        }

    async def execute(self, action: str, name: str = "", description: str = "",
                      steps: str = "", variables: str = "", **kwargs) -> str:
        try:
            if action == "create":
                if not name or not steps:
                    return "Fehler: 'name' und 'steps' sind erforderlich."
                try:
                    steps_list = json.loads(steps)
                except json.JSONDecodeError:
                    return "Fehler: 'steps' muss ein gueltiges JSON-Array sein."
                return await self.engine.create(name, description, steps_list)

            elif action == "list":
                scripts = await self.engine.list_scripts()
                if not scripts:
                    return "Keine Skripte vorhanden."
                lines = [
                    f"- **{s['name']}**: {s['description'] or '(keine Beschreibung)'} ({s['steps']} Schritte)"
                    for s in scripts
                ]
                return "Verfuegbare Skripte:\n" + "\n".join(lines)

            elif action == "show":
                if not name:
                    return "Fehler: 'name' ist erforderlich."
                script = await self.engine.get(name)
                if not script:
                    return f"Skript '{name}' nicht gefunden."
                import yaml
                return f"Skript '{name}':\n```yaml\n{yaml.dump(script, allow_unicode=True, default_flow_style=False)}```"

            elif action == "run":
                if not name:
                    return "Fehler: 'name' ist erforderlich."
                vars_dict = {}
                if variables:
                    try:
                        vars_dict = json.loads(variables)
                    except json.JSONDecodeError:
                        return "Fehler: 'variables' muss ein gueltiges JSON-Objekt sein."
                return await self.engine.run(name, vars_dict)

            elif action == "delete":
                if not name:
                    return "Fehler: 'name' ist erforderlich."
                return await self.engine.delete(name)

            else:
                return f"Unbekannte Aktion: {action}"

        except Exception as e:
            logger.exception("batch_script failed")
            return f"Fehler: {e}"
