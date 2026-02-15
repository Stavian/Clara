import asyncio
import logging
import aiohttp
from bs4 import BeautifulSoup
from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)


class WebFetchSkill(BaseSkill):
    @property
    def name(self) -> str:
        return "web_fetch"

    @property
    def description(self) -> str:
        return "Ruft eine Webseite ab und extrahiert den Textinhalt."

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "Die abzurufende URL",
                },
                "max_length": {
                    "type": "integer",
                    "description": "Maximale Textlaenge (Standard: 5000)",
                },
            },
            "required": ["url"],
        }

    async def execute(self, url: str, max_length: int = 5000, **kwargs) -> str:
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=15),
                ) as resp:
                    resp.raise_for_status()
                    html = await resp.text()

            # Run CPU-intensive HTML parsing in executor
            loop = asyncio.get_event_loop()
            text = await loop.run_in_executor(None, self._parse_html, html, max_length)

            return f"Inhalt von {url}:\n\n{text}"

        except Exception as e:
            logger.exception("web_fetch failed")
            return f"Fehler beim Abrufen von {url}: {e}"

    @staticmethod
    def _parse_html(html: str, max_length: int) -> str:
        soup = BeautifulSoup(html, "lxml")

        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()

        text = soup.get_text(separator="\n", strip=True)

        if len(text) > max_length:
            text = text[:max_length] + "\n... (gekuerzt)"

        return text
