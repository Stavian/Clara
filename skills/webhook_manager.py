import logging
from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)


class WebhookManagerSkill(BaseSkill):
    def __init__(self, manager):
        self.manager = manager

    @property
    def name(self) -> str:
        return "webhook_manager"

    @property
    def description(self) -> str:
        return "Verwaltet Webhooks: erstellen, auflisten, loeschen. Webhooks empfangen externe HTTP-Anfragen und loesen Ereignisse aus."

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["create", "list", "delete"],
                    "description": "Aktion: create, list, oder delete",
                },
                "name": {
                    "type": "string",
                    "description": "Name des Webhooks (fuer create/delete)",
                },
                "description": {
                    "type": "string",
                    "description": "Beschreibung des Webhooks (nur bei create)",
                },
            },
            "required": ["action"],
        }

    async def execute(self, action: str, name: str = "", description: str = "", **kwargs) -> str:
        try:
            if action == "create":
                if not name:
                    return "Fehler: 'name' ist erforderlich."
                result = await self.manager.create(name, description)
                if "error" in result:
                    return result["error"]
                url = f"/api/webhooks/incoming/{result['name']}?token={result['token']}"
                return (
                    f"Webhook '{result['name']}' erstellt.\n"
                    f"URL: {url}\n"
                    f"Token: {result['token']}\n"
                    f"Nutze diese URL fuer externe HTTP POST-Anfragen."
                )

            elif action == "list":
                webhooks = await self.manager.list_all()
                if not webhooks:
                    return "Keine Webhooks vorhanden."
                lines = [
                    f"- **{w['name']}**: {w['description'] or '(keine Beschreibung)'} "
                    f"(Token: {w['token'][:8]}...)"
                    for w in webhooks
                ]
                return "Registrierte Webhooks:\n" + "\n".join(lines)

            elif action == "delete":
                if not name:
                    return "Fehler: 'name' ist erforderlich."
                return await self.manager.delete(name)

            else:
                return f"Unbekannte Aktion: {action}"

        except Exception as e:
            logger.exception("webhook_manager failed")
            return f"Fehler: {e}"
