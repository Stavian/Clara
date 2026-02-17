import json
import logging
from skills.base_skill import BaseSkill
from automation.automation_engine import AutomationRule

logger = logging.getLogger(__name__)


class AutomationManagerSkill(BaseSkill):
    def __init__(self, automation_engine, event_bus):
        self.engine = automation_engine
        self.event_bus = event_bus

    @property
    def name(self) -> str:
        return "automation_manager"

    @property
    def description(self) -> str:
        return (
            "Verwaltet Automatisierungsregeln: erstellen, auflisten, aktivieren/deaktivieren, loeschen. "
            "Automatisierungen reagieren auf Ereignisse (Webhooks, Scheduler, Heartbeat) und fuehren Aktionen aus."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["create", "list", "enable", "disable", "delete", "recent_events"],
                    "description": "Aktion: create, list, enable, disable, delete, recent_events",
                },
                "name": {
                    "type": "string",
                    "description": "Name der Automation",
                },
                "event_type": {
                    "type": "string",
                    "enum": ["webhook_received", "schedule_triggered", "heartbeat", "system_event"],
                    "description": "Ereignis-Typ der die Automation ausloest (nur bei create)",
                },
                "event_filter": {
                    "type": "string",
                    "description": "JSON-Objekt mit Filterbedingungen, z.B. {\"source\": \"webhook:github\"} (nur bei create)",
                },
                "action_type": {
                    "type": "string",
                    "enum": ["run_skill", "run_script", "send_notification", "send_message"],
                    "description": "Art der auszufuehrenden Aktion (nur bei create)",
                },
                "action_config": {
                    "type": "string",
                    "description": "JSON-Objekt mit Aktionskonfiguration (nur bei create). Beispiele: {\"skill\":\"system_command\",\"args\":{\"command\":\"echo hi\"}} oder {\"message\":\"Webhook empfangen: {{event.source}}\",\"channels\":[\"web\"]}",
                },
            },
            "required": ["action"],
        }

    async def execute(self, action: str, name: str = "", event_type: str = "",
                      event_filter: str = "", action_type: str = "",
                      action_config: str = "", **kwargs) -> str:
        try:
            if action == "create":
                if not name or not event_type or not action_type or not action_config:
                    return "Fehler: 'name', 'event_type', 'action_type' und 'action_config' sind erforderlich."

                try:
                    filter_dict = json.loads(event_filter) if event_filter else {}
                except json.JSONDecodeError:
                    return "Fehler: 'event_filter' muss gueltiges JSON sein."

                try:
                    config_dict = json.loads(action_config)
                except json.JSONDecodeError:
                    return "Fehler: 'action_config' muss gueltiges JSON sein."

                rule = AutomationRule(
                    id=None,
                    name=name,
                    enabled=True,
                    event_type=event_type,
                    event_filter=filter_dict,
                    action_type=action_type,
                    action_config=config_dict,
                )
                return await self.engine.add_rule(rule)

            elif action == "list":
                rules = await self.engine.list_rules()
                if not rules:
                    return "Keine Automatisierungen vorhanden."
                lines = []
                for r in rules:
                    status = "aktiv" if r.enabled else "inaktiv"
                    lines.append(
                        f"- **{r.name}** [{status}]: Bei '{r.event_type}' -> {r.action_type}"
                    )
                return "Automatisierungen:\n" + "\n".join(lines)

            elif action == "enable":
                if not name:
                    return "Fehler: 'name' ist erforderlich."
                return await self.engine.toggle_rule(name, True)

            elif action == "disable":
                if not name:
                    return "Fehler: 'name' ist erforderlich."
                return await self.engine.toggle_rule(name, False)

            elif action == "delete":
                if not name:
                    return "Fehler: 'name' ist erforderlich."
                return await self.engine.remove_rule(name)

            elif action == "recent_events":
                events = self.event_bus.get_recent_events(20)
                if not events:
                    return "Keine aktuellen Ereignisse."
                lines = [
                    f"- [{e.timestamp}] {e.type} von {e.source}"
                    for e in events
                ]
                return "Letzte Ereignisse:\n" + "\n".join(lines)

            else:
                return f"Unbekannte Aktion: {action}"

        except Exception as e:
            logger.exception("automation_manager failed")
            return f"Fehler: {e}"
