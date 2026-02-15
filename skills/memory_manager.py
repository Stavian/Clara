import logging
from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)


class MemoryManagerSkill(BaseSkill):
    def __init__(self, db):
        self._db = db

    @property
    def name(self) -> str:
        return "memory_manager"

    @property
    def description(self) -> str:
        return (
            "Verwalte Claras Langzeitgedaechtnis. Speichere, suche, lese und loesche "
            "Erinnerungen ueber den Nutzer, seine Vorlieben und wichtige Fakten."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": [
                        "remember", "recall", "recall_category", "search",
                        "forget", "list_categories", "stats",
                    ],
                    "description": (
                        "Aktion: remember (speichern), recall (einzeln abrufen), "
                        "recall_category (Kategorie abrufen), search (suchen), "
                        "forget (loeschen), list_categories (Kategorien auflisten), "
                        "stats (Statistiken)"
                    ),
                },
                "category": {
                    "type": "string",
                    "description": (
                        "Kategorie der Erinnerung, z.B. 'vorlieben', 'persoenlich', "
                        "'technik', 'ziele', 'projekte'"
                    ),
                },
                "key": {
                    "type": "string",
                    "description": "Schluessel/Name der Erinnerung",
                },
                "value": {
                    "type": "string",
                    "description": "Wert/Inhalt der Erinnerung",
                },
                "query": {
                    "type": "string",
                    "description": "Suchbegriff fuer die Suche in Erinnerungen",
                },
            },
            "required": ["action"],
        }

    async def execute(self, **kwargs) -> str:
        action = kwargs.get("action", "")
        category = kwargs.get("category", "")
        key = kwargs.get("key", "")
        value = kwargs.get("value", "")
        query = kwargs.get("query", "")

        if action == "remember":
            if not category or not key or not value:
                return "Fehler: 'category', 'key' und 'value' sind erforderlich."
            await self._db.remember(category, key, value)
            return f"Gespeichert: [{category}] {key} = {value}"

        elif action == "recall":
            if not category or not key:
                return "Fehler: 'category' und 'key' sind erforderlich."
            result = await self._db.recall(category, key)
            if result:
                return f"[{category}] {key} = {result}"
            return f"Keine Erinnerung gefunden fuer [{category}] {key}"

        elif action == "recall_category":
            if not category:
                return "Fehler: 'category' ist erforderlich."
            entries = await self._db.recall_category(category)
            if not entries:
                return f"Keine Erinnerungen in Kategorie '{category}'"
            lines = [f"Kategorie '{category}' ({len(entries)} Eintraege):"]
            for e in entries:
                lines.append(f"  - {e['key']}: {e['value']}")
            return "\n".join(lines)

        elif action == "search":
            if not query:
                return "Fehler: 'query' ist erforderlich."
            results = await self._db.search_memory(query)
            if not results:
                return f"Keine Ergebnisse fuer '{query}'"
            lines = [f"Suchergebnisse fuer '{query}' ({len(results)} Treffer):"]
            for r in results:
                lines.append(f"  - [{r['category']}] {r['key']}: {r['value']}")
            return "\n".join(lines)

        elif action == "forget":
            if not category or not key:
                return "Fehler: 'category' und 'key' sind erforderlich."
            await self._db.forget(category, key)
            return f"Geloescht: [{category}] {key}"

        elif action == "list_categories":
            categories = await self._db.get_all_categories()
            if not categories:
                return "Noch keine Erinnerungen gespeichert."
            return "Kategorien: " + ", ".join(categories)

        elif action == "stats":
            count = await self._db.count_memories()
            categories = await self._db.get_all_categories()
            lines = [
                f"Gedaechtnis-Statistiken:",
                f"  Eintraege gesamt: {count}",
                f"  Kategorien: {len(categories)}",
            ]
            if categories:
                lines.append(f"  Kategorienamen: {', '.join(categories)}")
            return "\n".join(lines)

        return f"Unbekannte Aktion: {action}"
