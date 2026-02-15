import os
import re
import discord
import logging

from chat.adapters import ChannelAdapter
from config import Config

logger = logging.getLogger(__name__)

DISCORD_MAX_LENGTH = 2000


class DiscordAdapter(ChannelAdapter):
    """Channel adapter that sends events to a Discord text channel."""

    def __init__(self, message: discord.Message):
        self.message = message
        self.channel = message.channel
        self._stream_buffer = ""

    async def send_tool_call(self, tool_name: str, args: dict) -> None:
        brief = ""
        if args:
            parts = []
            for k, v in args.items():
                s = repr(v)
                if len(s) > 60:
                    s = s[:57] + "..."
                parts.append(f"{k}={s}")
            brief = ", ".join(parts)

        embed = discord.Embed(
            title="Tool wird ausgefuehrt...",
            description=f"**{tool_name}**" + (f"\n{brief}" if brief else ""),
            color=0x5865F2,
        )
        try:
            await self.channel.send(embed=embed)
        except Exception:
            logger.debug("Failed to send tool_call embed to Discord")

    async def send_image(self, src: str, alt: str) -> None:
        filename = os.path.basename(src)
        if "/generated/audio/" in src:
            filepath = Config.GENERATED_AUDIO_DIR / filename
        else:
            filepath = Config.GENERATED_IMAGES_DIR / filename

        if filepath.exists():
            try:
                await self.channel.send(
                    content=alt or "Generiertes Bild:",
                    file=discord.File(str(filepath), filename=filename),
                )
            except Exception:
                logger.debug("Failed to send image to Discord")

    async def send_stream_token(self, token: str) -> None:
        self._stream_buffer += token

    async def send_stream_end(self) -> None:
        if self._stream_buffer:
            await self._send_long_message(self._stream_buffer)
            self._stream_buffer = ""

    async def send_message(self, content: str) -> None:
        await self._send_long_message(content)

    async def send_error(self, content: str) -> None:
        embed = discord.Embed(
            title="Fehler",
            description=content[:4000],
            color=0xFF0000,
        )
        try:
            await self.channel.send(embed=embed)
        except Exception:
            logger.debug("Failed to send error embed to Discord")

    async def send_audio(self, src: str) -> None:
        filename = os.path.basename(src)
        filepath = Config.GENERATED_AUDIO_DIR / filename
        if filepath.exists():
            try:
                await self.channel.send(
                    file=discord.File(str(filepath), filename=filename),
                )
            except Exception:
                logger.debug("Failed to send audio to Discord")

    async def _send_long_message(self, text: str) -> None:
        if not text:
            return
        chunks = _split_message(text, DISCORD_MAX_LENGTH)
        for chunk in chunks:
            try:
                await self.channel.send(chunk)
            except Exception:
                logger.debug("Failed to send message chunk to Discord")


def _split_message(text: str, max_len: int) -> list[str]:
    """Split text into chunks, preferring line breaks, then spaces."""
    if len(text) <= max_len:
        return [text]

    chunks = []
    while text:
        if len(text) <= max_len:
            chunks.append(text)
            break

        # Try to split at a newline
        cut = text.rfind("\n", 0, max_len)
        if cut <= 0:
            # Try space
            cut = text.rfind(" ", 0, max_len)
        if cut <= 0:
            cut = max_len

        chunks.append(text[:cut])
        text = text[cut:].lstrip("\n")

    return chunks
