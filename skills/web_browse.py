import asyncio
import logging
from duckduckgo_search import DDGS
from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)


class WebBrowseSkill(BaseSkill):
    @property
    def name(self) -> str:
        return "web_browse"

    @property
    def description(self) -> str:
        return "Sucht im Internet nach Informationen mit DuckDuckGo."

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Der Suchbegriff",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximale Anzahl der Ergebnisse (Standard: 5)",
                },
            },
            "required": ["query"],
        }

    async def execute(self, query: str, max_results: int = 5, **kwargs) -> str:
        try:
            # Run synchronous DuckDuckGo search in executor to avoid blocking
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(None, self._search_sync, query, max_results)

            if not results:
                return f"Keine Ergebnisse fuer '{query}' gefunden."

            output = []
            for i, r in enumerate(results, 1):
                output.append(f"{i}. **{r.get('title', '')}**\n   {r.get('body', '')}\n   URL: {r.get('href', '')}")
            return "\n\n".join(output)
        except Exception as e:
            logger.exception("Web browse failed")
            return f"Fehler bei der Websuche: {e}"

    @staticmethod
    def _search_sync(query: str, max_results: int) -> list[dict]:
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results))
