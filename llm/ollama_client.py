import logging
import json
import aiohttp
from collections.abc import AsyncIterator

logger = logging.getLogger(__name__)


class OllamaClient:
    def __init__(self, base_url: str, model: str, embedding_model: str):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.embedding_model = embedding_model
        self._session: aiohttp.ClientSession | None = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None

    async def chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        model: str | None = None,
        options: dict | None = None,
    ) -> dict:
        payload: dict = {
            "model": model or self.model,
            "messages": messages,
            "stream": False,
        }
        if tools:
            payload["tools"] = tools
        if options:
            payload["options"] = options

        session = await self._get_session()
        async with session.post(
            f"{self.base_url}/api/chat",
            json=payload,
            timeout=aiohttp.ClientTimeout(total=300),
        ) as resp:
            resp.raise_for_status()
            data = await resp.json()
            return data.get("message", {})

    async def chat_stream(
        self,
        messages: list[dict],
        model: str | None = None,
    ) -> AsyncIterator[str]:
        """Stream chat responses token by token. Only for final responses (no tools)."""
        payload: dict = {
            "model": model or self.model,
            "messages": messages,
            "stream": True,
        }

        session = await self._get_session()
        async with session.post(
            f"{self.base_url}/api/chat",
            json=payload,
            timeout=aiohttp.ClientTimeout(total=120),
        ) as resp:
            resp.raise_for_status()
            async for line in resp.content:
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    token = data.get("message", {}).get("content", "")
                    if token:
                        yield token
                    if data.get("done"):
                        break
                except json.JSONDecodeError:
                    continue

    async def generate(self, prompt: str, model: str | None = None) -> str:
        payload = {
            "model": model or self.model,
            "prompt": prompt,
            "stream": False,
        }
        session = await self._get_session()
        async with session.post(
            f"{self.base_url}/api/generate",
            json=payload,
            timeout=aiohttp.ClientTimeout(total=120),
        ) as resp:
            resp.raise_for_status()
            data = await resp.json()
            return data.get("response", "")

    async def embed(self, text: str) -> list[float]:
        payload = {
            "model": self.embedding_model,
            "input": text,
        }
        session = await self._get_session()
        async with session.post(
            f"{self.base_url}/api/embed",
            json=payload,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            resp.raise_for_status()
            data = await resp.json()
            embeddings = data.get("embeddings", [[]])
            return embeddings[0] if embeddings else []

    async def is_available(self) -> bool:
        try:
            session = await self._get_session()
            async with session.get(
                f"{self.base_url}/api/tags",
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                return resp.status == 200
        except Exception:
            return False
