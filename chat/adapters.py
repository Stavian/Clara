from abc import ABC, abstractmethod


class ChannelAdapter(ABC):
    """Abstract base for messaging channel adapters (WebSocket, Discord, etc.)."""

    @abstractmethod
    async def send_tool_call(self, tool_name: str, args: dict) -> None:
        ...

    @abstractmethod
    async def send_image(self, src: str, alt: str) -> None:
        ...

    @abstractmethod
    async def send_stream_token(self, token: str) -> None:
        ...

    @abstractmethod
    async def send_stream_end(self) -> None:
        ...

    @abstractmethod
    async def send_message(self, content: str) -> None:
        ...

    @abstractmethod
    async def send_error(self, content: str) -> None:
        ...

    @abstractmethod
    async def send_audio(self, src: str) -> None:
        ...


class WebSocketAdapter(ChannelAdapter):
    """Adapter that sends events over a FastAPI WebSocket."""

    def __init__(self, ws):
        self.ws = ws

    async def send_tool_call(self, tool_name: str, args: dict) -> None:
        await self.ws.send_json({"type": "tool_call", "tool": tool_name, "args": args})

    async def send_image(self, src: str, alt: str) -> None:
        await self.ws.send_json({"type": "image", "src": src, "alt": alt})

    async def send_stream_token(self, token: str) -> None:
        await self.ws.send_json({"type": "stream", "token": token})

    async def send_stream_end(self) -> None:
        await self.ws.send_json({"type": "stream_end"})

    async def send_message(self, content: str) -> None:
        await self.ws.send_json({"type": "message", "content": content})

    async def send_error(self, content: str) -> None:
        await self.ws.send_json({"type": "error", "content": content})

    async def send_audio(self, src: str) -> None:
        await self.ws.send_json({"type": "audio", "src": src})
