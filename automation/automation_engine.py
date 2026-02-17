import re
import json
import logging
from dataclasses import dataclass
from typing import Any

from automation.event_bus import Event, EventBus

logger = logging.getLogger(__name__)


@dataclass
class AutomationRule:
    id: int | None
    name: str
    enabled: bool
    event_type: str
    event_filter: dict[str, Any]
    action_type: str        # "run_skill", "run_script", "send_notification", "send_message"
    action_config: dict[str, Any]


class AutomationEngine:
    def __init__(self, db, event_bus: EventBus):
        self.db = db
        self.event_bus = event_bus
        self._rules: list[AutomationRule] = []
        self.skill_registry = None
        self.notification_service = None
        self.script_engine = None

    async def initialize(self):
        await self.db.execute("""
            CREATE TABLE IF NOT EXISTS automations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                enabled INTEGER NOT NULL DEFAULT 1,
                event_type TEXT NOT NULL,
                event_filter TEXT NOT NULL DEFAULT '{}',
                action_type TEXT NOT NULL,
                action_config TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        await self.db.execute(
            "CREATE INDEX IF NOT EXISTS idx_automations_event_type ON automations(event_type)"
        )
        await self._load_rules()
        self.event_bus.subscribe_all(self._on_event)

    async def _load_rules(self):
        rows = await self.db.fetchall("SELECT * FROM automations")
        self._rules = []
        for r in rows:
            self._rules.append(AutomationRule(
                id=r["id"],
                name=r["name"],
                enabled=bool(r["enabled"]),
                event_type=r["event_type"],
                event_filter=json.loads(r["event_filter"]),
                action_type=r["action_type"],
                action_config=json.loads(r["action_config"]),
            ))
        logger.info(f"Loaded {len(self._rules)} automation rules")

    async def add_rule(self, rule: AutomationRule) -> str:
        await self.db.execute(
            "INSERT INTO automations (name, enabled, event_type, event_filter, action_type, action_config) VALUES (?,?,?,?,?,?)",
            (rule.name, int(rule.enabled), rule.event_type,
             json.dumps(rule.event_filter), rule.action_type, json.dumps(rule.action_config)),
        )
        await self._load_rules()
        return f"Automation '{rule.name}' erstellt."

    async def remove_rule(self, name: str) -> str:
        await self.db.execute("DELETE FROM automations WHERE name = ?", (name,))
        await self._load_rules()
        return f"Automation '{name}' entfernt."

    async def toggle_rule(self, name: str, enabled: bool) -> str:
        await self.db.execute("UPDATE automations SET enabled = ? WHERE name = ?", (int(enabled), name))
        await self._load_rules()
        state = "aktiviert" if enabled else "deaktiviert"
        return f"Automation '{name}' {state}."

    async def list_rules(self) -> list[AutomationRule]:
        return list(self._rules)

    async def _on_event(self, event: Event):
        for rule in self._rules:
            if not rule.enabled:
                continue
            if rule.event_type != event.type:
                continue
            if not self._matches_filter(event, rule.event_filter):
                continue
            logger.info(f"Automation '{rule.name}' triggered by {event.type}:{event.source}")
            try:
                await self._execute_action(rule, event)
            except Exception:
                logger.exception(f"Automation '{rule.name}' action failed")

    def _matches_filter(self, event: Event, filt: dict) -> bool:
        if not filt:
            return True
        for key, expected in filt.items():
            if key == "source":
                if event.source != expected:
                    return False
            elif key.startswith("data."):
                path = key[5:].split(".")
                val = event.data
                for p in path:
                    if isinstance(val, dict):
                        val = val.get(p)
                    else:
                        val = None
                        break
                if val != expected:
                    return False
        return True

    async def _execute_action(self, rule: AutomationRule, event: Event):
        cfg = rule.action_config

        if rule.action_type == "run_skill":
            skill_name = cfg.get("skill", "")
            args = self._substitute_vars(dict(cfg.get("args", {})), event)
            if self.skill_registry:
                result = await self.skill_registry.execute(skill_name, **args)
                logger.info(f"Automation '{rule.name}' skill result: {result[:200]}")

        elif rule.action_type == "run_script":
            script_name = cfg.get("script", "")
            variables = self._substitute_vars(dict(cfg.get("variables", {})), event)
            if self.script_engine:
                result = await self.script_engine.run(script_name, variables)
                logger.info(f"Automation '{rule.name}' script result: {result[:200]}")

        elif rule.action_type == "send_notification":
            message = cfg.get("message", "Automation ausgeloest.")
            message = self._substitute_text(message, event)
            channels = cfg.get("channels", ["web", "discord"])
            if self.notification_service:
                await self.notification_service.notify(message, channels=channels)

        elif rule.action_type == "send_message":
            message = cfg.get("message", "")
            message = self._substitute_text(message, event)
            if self.notification_service:
                await self.notification_service.send_as_clara(message)

    def _substitute_vars(self, args: dict, event: Event) -> dict:
        result = {}
        for k, v in args.items():
            if isinstance(v, str):
                result[k] = self._substitute_text(v, event)
            else:
                result[k] = v
        return result

    def _substitute_text(self, text: str, event: Event) -> str:
        def replacer(m):
            path = m.group(1)
            if path == "event.type":
                return event.type
            if path == "event.source":
                return event.source
            if path.startswith("event.data."):
                parts = path[11:].split(".")
                val = event.data
                for p in parts:
                    if isinstance(val, dict):
                        val = val.get(p, "")
                    else:
                        val = ""
                        break
                return str(val)
            return m.group(0)
        return re.sub(r"\{\{(event\.[^}]+)\}\}", replacer, text)
