import asyncio
import logging

import pyperclip

from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)


class ClipboardSkill(BaseSkill):
    @property
    def name(self) -> str:
        return "clipboard"

    @property
    def description(self) -> str:
        return (
            "Liest oder schreibt Text in die Zwischenablage des Systems. "
            "Kann den aktuellen Inhalt lesen oder neuen Text setzen."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["read", "write"],
                    "description": "'read' liest den Inhalt der Zwischenablage, 'write' setzt neuen Inhalt.",
                },
                "text": {
                    "type": "string",
                    "description": "Der Text, der in die Zwischenablage geschrieben werden soll. Nur bei action='write'.",
                },
            },
            "required": ["action"],
        }

    async def execute(self, action: str = "read", **kwargs) -> str:
        try:
            loop = asyncio.get_event_loop()

            if action == "write":
                text = kwargs.get("text", "")
                if not text:
                    return "Fehler: Kein Text zum Schreiben angegeben."
                await loop.run_in_executor(None, pyperclip.copy, text)
                return f"Text in Zwischenablage geschrieben ({len(text)} Zeichen)."

            # read
            content = await loop.run_in_executor(None, pyperclip.paste)
            if not content:
                return "Die Zwischenablage ist leer."
            # Limit output to avoid overwhelming LLM context
            if len(content) > 5000:
                return f"Zwischenablage-Inhalt ({len(content)} Zeichen, gekuerzt):\n\n{content[:5000]}..."
            return f"Zwischenablage-Inhalt:\n\n{content}"
        except Exception as e:
            logger.exception("Clipboard operation failed")
            return f"Fehler bei Zwischenablage-Operation: {e}"
