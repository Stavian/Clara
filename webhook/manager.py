import secrets
import logging

from automation.event_bus import EventBus, Event

logger = logging.getLogger(__name__)


class WebhookManager:
    def __init__(self, db, event_bus: EventBus):
        self.db = db
        self.event_bus = event_bus
        self._webhooks: dict[str, dict] = {}

    async def initialize(self):
        await self.db.execute("""
            CREATE TABLE IF NOT EXISTS webhooks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                token TEXT NOT NULL,
                description TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        rows = await self.db.fetchall("SELECT name, token, description FROM webhooks")
        self._webhooks = {
            r["name"]: {"name": r["name"], "token": r["token"], "description": r["description"]}
            for r in rows
        }
        logger.info(f"Loaded {len(self._webhooks)} webhooks")

    async def create(self, name: str, description: str = "") -> dict:
        if name in self._webhooks:
            return {"error": f"Webhook '{name}' existiert bereits."}
        token = secrets.token_urlsafe(32)
        await self.db.execute(
            "INSERT INTO webhooks (name, token, description) VALUES (?,?,?)",
            (name, token, description),
        )
        entry = {"name": name, "token": token, "description": description}
        self._webhooks[name] = entry
        return entry

    async def delete(self, name: str) -> str:
        if name not in self._webhooks:
            return f"Webhook '{name}' nicht gefunden."
        await self.db.execute("DELETE FROM webhooks WHERE name = ?", (name,))
        del self._webhooks[name]
        return f"Webhook '{name}' geloescht."

    async def list_all(self) -> list[dict]:
        return list(self._webhooks.values())

    def verify_token(self, name: str, token: str) -> bool:
        wh = self._webhooks.get(name)
        if not wh:
            return False
        return secrets.compare_digest(wh["token"], token)

    async def handle_incoming(self, name: str, payload: dict):
        await self.event_bus.emit(Event(
            type="webhook_received",
            source=f"webhook:{name}",
            data=payload,
        ))
