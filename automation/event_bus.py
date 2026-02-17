import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Awaitable

logger = logging.getLogger(__name__)

Subscriber = Callable[["Event"], Awaitable[None]]


@dataclass
class Event:
    type: str       # "webhook_received", "schedule_triggered", "heartbeat", "system_event"
    source: str     # e.g. "webhook:github", "scheduler:daily_backup", "system:startup"
    data: dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


class EventBus:
    """Central async pub/sub event system."""

    def __init__(self):
        self._subscribers: dict[str, list[Subscriber]] = {}
        self._global_subscribers: list[Subscriber] = []
        self._history: list[Event] = []
        self._max_history = 100

    def subscribe(self, event_type: str, handler: Subscriber):
        self._subscribers.setdefault(event_type, []).append(handler)

    def subscribe_all(self, handler: Subscriber):
        self._global_subscribers.append(handler)

    def unsubscribe(self, event_type: str, handler: Subscriber):
        if event_type in self._subscribers:
            self._subscribers[event_type] = [
                h for h in self._subscribers[event_type] if h is not handler
            ]

    async def emit(self, event: Event):
        logger.info(f"Event: {event.type} from {event.source}")
        self._history.append(event)
        if len(self._history) > self._max_history:
            self._history = self._history[-self._max_history:]

        handlers = list(self._global_subscribers)
        handlers.extend(self._subscribers.get(event.type, []))

        for handler in handlers:
            asyncio.create_task(self._safe_call(handler, event))

    async def _safe_call(self, handler: Subscriber, event: Event):
        try:
            await handler(event)
        except Exception:
            logger.exception(f"Event handler failed for {event.type}")

    def get_recent_events(self, limit: int = 20) -> list[Event]:
        return list(reversed(self._history[-limit:]))
