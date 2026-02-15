import logging
import json
import aiohttp

logger = logging.getLogger(__name__)


class OllamaClient:
    def __init__(self, base_url: str, model: str, embedding_model: str):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.embedding_model = embedding_model

    async def chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
    ) -> dict:
        payload: dict = {
            "model": self.model,
            "messages": messages,
            "stream": False,
        }
        if tools:
            payload["tools"] = tools

        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/api/chat",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=120),
            ) as resp:
                resp.raise_for_status()
                data = await resp.json()
                return data.get("message", {})

    async def generate(self, prompt: str) -> str:
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
        }
        async with aiohttp.ClientSession() as session:
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
        async with aiohttp.ClientSession() as session:
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
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.base_url}/api/tags",
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    return resp.status == 200
        except Exception:
            return False
