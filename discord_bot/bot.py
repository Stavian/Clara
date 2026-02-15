import logging
import discord
from discord import Intents

from config import Config
from chat.engine import ChatEngine
from discord_bot.adapter import DiscordAdapter

logger = logging.getLogger(__name__)


class ClaraDiscordBot:
    """Discord bot that connects Clara to Discord channels and DMs."""

    def __init__(self, token: str, chat_engine: ChatEngine):
        self.token = token
        self.chat_engine = chat_engine

        intents = Intents.default()
        intents.message_content = True
        self.client = discord.Client(intents=intents)

        self._setup_events()

    def _setup_events(self):
        @self.client.event
        async def on_ready():
            logger.info(f"Discord bot connected as {self.client.user}")
            logger.info(
                f"Discord owner ID: {Config.DISCORD_OWNER_ID or 'NOT SET (all users restricted)'}"
            )

        @self.client.event
        async def on_message(message: discord.Message):
            # Ignore own messages
            if message.author == self.client.user:
                return

            # Ignore bots
            if message.author.bot:
                return

            # In servers: only respond when mentioned
            # In DMs: always respond
            if message.guild and not self.client.user.mentioned_in(message):
                return

            # Strip the bot mention from the message text
            content = message.content
            if self.client.user:
                content = content.replace(f"<@{self.client.user.id}>", "").strip()
                content = content.replace(f"<@!{self.client.user.id}>", "").strip()

            if not content:
                return

            # Session ID: channel-based for servers, user-based for DMs
            if message.guild:
                session_id = f"discord-channel-{message.channel.id}"
            else:
                session_id = f"discord-dm-{message.author.id}"

            # Permission check: owner gets full access, others get public skills only
            is_owner = (
                Config.DISCORD_OWNER_ID
                and str(message.author.id) == Config.DISCORD_OWNER_ID
            )
            allowed_skills = None if is_owner else Config.DISCORD_PUBLIC_SKILLS

            adapter = DiscordAdapter(message)

            async with message.channel.typing():
                try:
                    await self.chat_engine.handle_message(
                        channel=adapter,
                        session_id=session_id,
                        user_message=content,
                        image_b64=None,
                        tts_enabled=False,
                        allowed_skills=allowed_skills,
                    )
                except Exception as e:
                    logger.exception("Discord message handling failed")
                    await adapter.send_error(f"Fehler: {e}")

    async def start(self):
        """Start the bot (non-blocking, runs in current event loop)."""
        logger.info("Starting Discord bot...")
        await self.client.start(self.token)

    async def close(self):
        """Gracefully shut down the bot."""
        if not self.client.is_closed():
            logger.info("Shutting down Discord bot...")
            await self.client.close()
