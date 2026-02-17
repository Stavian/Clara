import logging
from datetime import datetime

from chat.adapters import ChannelAdapter, WebSocketAdapter
from config import Config

logger = logging.getLogger(__name__)


class NotificationService:
    """Sends proactive messages to web UI and Discord DMs without a prior user request."""

    def __init__(self):
        self._web_connections: list[WebSocketAdapter] = []
        self._discord_bot = None
        self._db = None
        self._chat_engine = None

    def set_discord_bot(self, bot):
        self._discord_bot = bot

    def set_db(self, db):
        self._db = db

    def set_chat_engine(self, engine):
        self._chat_engine = engine

    def register_web_connection(self, adapter: WebSocketAdapter):
        self._web_connections.append(adapter)

    def unregister_web_connection(self, adapter: WebSocketAdapter):
        self._web_connections = [a for a in self._web_connections if a is not adapter]

    async def notify(self, message: str, channels: list[str] | None = None):
        channels = channels or ["web", "discord"]
        logger.info(f"Notification to {channels}: {message[:100]}")

        if "web" in channels:
            await self._notify_web(message)
        if "discord" in channels:
            await self._notify_discord(message)

        if self._db:
            await self._db.execute(
                "INSERT INTO notifications (message, channels, timestamp) VALUES (?,?,?)",
                (message, ",".join(channels), datetime.now().isoformat()),
            )

    async def initialize_table(self):
        if self._db:
            await self._db.execute("""
                CREATE TABLE IF NOT EXISTS notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    message TEXT NOT NULL,
                    channels TEXT NOT NULL,
                    timestamp TEXT NOT NULL
                )
            """)
            await self._db.execute(
                "CREATE INDEX IF NOT EXISTS idx_notifications_timestamp ON notifications(timestamp)"
            )

    async def _notify_web(self, message: str):
        dead = []
        for adapter in self._web_connections:
            try:
                await adapter.ws.send_json({
                    "type": "notification",
                    "content": message,
                    "timestamp": datetime.now().isoformat(),
                })
            except Exception:
                dead.append(adapter)
        for d in dead:
            self._web_connections.remove(d)

    async def _notify_discord(self, message: str):
        if not self._discord_bot or not Config.DISCORD_OWNER_ID:
            return
        try:
            client = self._discord_bot.client
            user = await client.fetch_user(int(Config.DISCORD_OWNER_ID))
            if user:
                # Split long messages for Discord 2000 char limit
                while message:
                    chunk = message[:2000]
                    message = message[2000:]
                    await user.send(chunk)
        except Exception:
            logger.exception("Failed to send Discord DM notification")

    async def send_as_clara(self, user_message: str):
        if not self._chat_engine:
            logger.warning("No chat engine set for send_as_clara")
            return
        adapter = CollectorAdapter()
        try:
            response = await self._chat_engine.handle_message(
                channel=adapter,
                session_id="automation-internal",
                user_message=user_message,
                allowed_skills=None,
            )
            if response:
                await self.notify(response)
        except Exception:
            logger.exception("send_as_clara failed")


class CollectorAdapter(ChannelAdapter):
    """No-op adapter that collects output for automation-triggered Clara invocations."""

    def __init__(self):
        self.messages = []
        self.images = []

    async def send_tool_call(self, tool_name: str, args: dict) -> None:
        pass

    async def send_image(self, src: str, alt: str) -> None:
        self.images.append({"src": src, "alt": alt})

    async def send_stream_token(self, token: str) -> None:
        pass

    async def send_stream_end(self) -> None:
        pass

    async def send_message(self, content: str) -> None:
        self.messages.append(content)

    async def send_error(self, content: str) -> None:
        pass

    async def send_audio(self, src: str) -> None:
        pass
