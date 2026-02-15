import asyncio
import re
import logging

from chat.adapters import ChannelAdapter
from config import Config
from memory.context_builder import build_memory_context
from memory.fact_extractor import extract_facts
from services.tts_service import generate_tts

logger = logging.getLogger(__name__)

_THINK_RE = re.compile(r"<think>[\s\S]*?</think>\s*", re.IGNORECASE)


def _strip_think(text: str) -> str:
    """Remove <think>...</think> blocks and model filler from output."""
    text = _THINK_RE.sub("", text)
    # Handle unclosed <think> (no </think>): drop everything from <think> onward
    if "<think>" in text.lower():
        idx = text.lower().rfind("<think>")
        text = text[:idx]
    # Handle </think> without opening <think>: drop everything up to and including </think>
    if "</think>" in text.lower():
        idx = text.lower().rfind("</think>")
        text = text[idx + len("</think>"):]
    lines = text.split("\n")
    cleaned = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            cleaned.append(line)
            continue
        if re.search(r"[a-zA-Z0-9äöüÄÖÜß]", stripped):
            cleaned.append(line)
    text = "\n".join(cleaned)
    return text.strip()


class ChatEngine:
    """Channel-agnostic chat engine: LLM calls, tool execution, streaming."""

    def __init__(self, ollama, db, skills, agent_router, system_prompt: str):
        self.ollama = ollama
        self.db = db
        self.skills = skills
        self.agent_router = agent_router
        self.system_prompt = system_prompt

    async def handle_message(
        self,
        channel: ChannelAdapter,
        session_id: str,
        user_message: str,
        image_b64: str | None = None,
        tts_enabled: bool = False,
        allowed_skills: list[str] | None = None,
        agent_override: str | None = None,
    ) -> str:
        """Process a user message through the full LLM + tool pipeline.

        Args:
            channel: Adapter for sending events back to the user.
            session_id: Conversation session identifier.
            user_message: The user's text message.
            image_b64: Optional base64-encoded image.
            tts_enabled: Whether to generate TTS audio.
            allowed_skills: List of skill names the user may use.
                            None means all skills (owner / web UI).

        Returns:
            The final assistant response text.
        """
        display_text = user_message
        user_content = user_message

        if image_b64:
            if not user_message:
                user_content = "Was siehst du auf diesem Bild?"
            display_text = f"[Bild angehängt] {user_content}" if user_message else "[Bild angehängt]"

        await self.db.save_message(session_id, "user", display_text)

        history = await self.db.get_history(session_id, limit=Config.MAX_CONVERSATION_HISTORY)
        memory_context = await build_memory_context(self.db)
        system_content = self.system_prompt + memory_context
        messages = [{"role": "system", "content": system_content}]
        messages.extend(history)

        if image_b64 and messages:
            messages[-1] = {
                "role": "user",
                "content": user_content,
                "images": [image_b64],
            }

        # Direct agent mode: bypass normal LLM + tool loop
        if agent_override and agent_override != "general" and self.agent_router:
            await channel.send_tool_call(f"agent:{agent_override}", {"task": user_content})

            result, events = await self.agent_router.run_agent(
                agent_override, user_content, conversation_context=history
            )

            for event in events:
                if event.get("type") == "tool_call":
                    await channel.send_tool_call(event.get("tool", ""), event.get("args", {}))
                elif event.get("type") == "image":
                    await channel.send_image(event.get("src", ""), event.get("alt", ""))

            assistant_text = result
            await channel.send_message(assistant_text)
            await self.db.save_message(session_id, "assistant", assistant_text)

            asyncio.create_task(
                extract_facts(self.ollama, self.db, display_text, assistant_text)
            )
            if tts_enabled:
                asyncio.create_task(self._send_tts(channel, assistant_text))

            return assistant_text

        # Build tool definitions filtered by allowed_skills
        tools = self._get_filtered_tools(allowed_skills)

        max_tool_rounds = 5
        response = {}
        for _ in range(max_tool_rounds):
            response = await self.ollama.chat(messages, tools=tools)

            if response.get("tool_calls"):
                tool_calls = response["tool_calls"]

                agent_calls = []
                regular_calls = []
                for tc in tool_calls:
                    fn = tc.get("function", {})
                    if fn.get("name") == "delegate_to_agent" and self.agent_router:
                        agent_calls.append(tc)
                    else:
                        regular_calls.append(tc)

                # Handle agent delegations sequentially
                for tool_call in agent_calls:
                    fn = tool_call.get("function", {})
                    tool_args = fn.get("arguments", {})
                    agent_name = tool_args.get("agent", "")
                    task = tool_args.get("task", "")

                    # Check if agent is allowed for this user
                    if not self._is_agent_allowed(agent_name, allowed_skills):
                        messages.append({
                            "role": "assistant",
                            "content": "",
                            "tool_calls": [tool_call],
                        })
                        messages.append({
                            "role": "tool",
                            "name": "delegate_to_agent",
                            "content": f"Fehler: Zugriff auf Agent '{agent_name}' nicht erlaubt.",
                        })
                        continue

                    logger.info(f"Tool call: delegate_to_agent({tool_args})")

                    await channel.send_tool_call(f"agent:{agent_name}", {"task": task})

                    result, events = await self.agent_router.run_agent(
                        agent_name, task, conversation_context=history
                    )

                    for event in events:
                        if event.get("type") == "tool_call":
                            await channel.send_tool_call(event.get("tool", ""), event.get("args", {}))
                        elif event.get("type") == "image":
                            await channel.send_image(event.get("src", ""), event.get("alt", ""))

                    messages.append({
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [tool_call],
                    })
                    messages.append({
                        "role": "tool",
                        "name": "delegate_to_agent",
                        "content": f"[Antwort von Agent '{agent_name}']\n{result}",
                    })

                # Execute regular tools in parallel
                if regular_calls:
                    tasks = []
                    for tc in regular_calls:
                        fn = tc.get("function", {})
                        tool_name = fn.get("name", "")
                        tool_args = fn.get("arguments", {})
                        logger.info(f"Tool call: {tool_name}({tool_args})")
                        tasks.append(self._execute_tool(tool_name, tool_args, channel, allowed_skills))

                    results = await asyncio.gather(*tasks, return_exceptions=True)

                    for tc, res in zip(regular_calls, results):
                        fn = tc.get("function", {})
                        tool_name = fn.get("name", "")
                        if isinstance(res, Exception):
                            result_text = f"Fehler: {res}"
                            logger.exception(f"Tool {tool_name} failed", exc_info=res)
                        else:
                            _, result_text = res

                        messages.append({
                            "role": "assistant",
                            "content": "",
                            "tool_calls": [tc],
                        })
                        messages.append({
                            "role": "tool",
                            "name": tool_name,
                            "content": f"[Ergebnis von {tool_name}]\n{result_text}",
                        })
            else:
                break

        assistant_text = _strip_think(response.get("content", ""))

        if not assistant_text and len(messages) > 2:
            messages.append({
                "role": "user",
                "content": "Fasse die Ergebnisse der Tool-Aufrufe zusammen und beantworte meine urspruengliche Frage basierend auf den erhaltenen Daten.",
            })
            raw_text = ""
            streaming_started = False
            async for token in self.ollama.chat_stream(messages):
                raw_text += token
                if not streaming_started:
                    if "<think>" in raw_text.lower() and "</think>" not in raw_text.lower():
                        continue
                    streaming_started = True
                    cleaned = _strip_think(raw_text)
                    if cleaned:
                        assistant_text = cleaned
                        await channel.send_stream_token(cleaned)
                else:
                    assistant_text += token
                    await channel.send_stream_token(token)
            assistant_text = _strip_think(raw_text)
            await channel.send_stream_end()
        elif assistant_text:
            await channel.send_message(assistant_text)
        else:
            assistant_text = "Ich konnte leider keine Antwort generieren."
            await channel.send_message(assistant_text)

        await self.db.save_message(session_id, "assistant", assistant_text)

        asyncio.create_task(
            extract_facts(self.ollama, self.db, display_text, assistant_text)
        )

        if tts_enabled:
            asyncio.create_task(self._send_tts(channel, assistant_text))

        return assistant_text

    def _get_filtered_tools(self, allowed_skills: list[str] | None) -> list[dict]:
        """Get tool definitions filtered by allowed skills."""
        if allowed_skills is None:
            tools = self.skills.get_tool_definitions()
        else:
            tools = [
                skill.to_tool_definition()
                for skill in self.skills.get_all()
                if skill.name in allowed_skills
            ]

        if self.agent_router:
            if allowed_skills is None:
                delegate_def = self.agent_router.get_delegate_tool_definition()
            else:
                allowed_agents = self._get_allowed_agents(allowed_skills)
                delegate_def = (
                    self.agent_router.get_delegate_tool_definition(filter_agents=allowed_agents)
                    if allowed_agents else None
                )
            if delegate_def:
                tools.append(delegate_def)

        return tools

    def _get_allowed_agents(self, allowed_skills: list[str]) -> list[str]:
        """Return agent names whose skills are all within allowed_skills."""
        return self.agent_router.get_allowed_agents(allowed_skills)

    def _is_agent_allowed(self, agent_name: str, allowed_skills: list[str] | None) -> bool:
        """Check if a specific agent is allowed given the skill restrictions."""
        if allowed_skills is None:
            return True
        allowed_agents = self._get_allowed_agents(allowed_skills)
        return agent_name in allowed_agents

    async def _execute_tool(
        self,
        tool_name: str,
        tool_args: dict,
        channel: ChannelAdapter,
        allowed_skills: list[str] | None,
    ) -> tuple[str, str]:
        """Execute a single tool and return (tool_name, result)."""
        # Defense in depth: block tool if not in allowed_skills
        if allowed_skills is not None and tool_name not in allowed_skills:
            return tool_name, f"Fehler: Zugriff auf '{tool_name}' nicht erlaubt."

        skill = self.skills.get(tool_name)
        if skill:
            valid_params = set(skill.parameters.get("properties", {}).keys())
            filtered_args = {k: v for k, v in tool_args.items() if k in valid_params}
        else:
            filtered_args = tool_args

        await channel.send_tool_call(tool_name, filtered_args)

        result = await self.skills.execute(tool_name, **filtered_args)

        img_matches = re.findall(
            r'!\[([^\]]*)\]\((\/generated\/[^)]+)\)', result or ""
        )
        for alt, src in img_matches:
            await channel.send_image(src, alt)

        if img_matches:
            result = re.sub(r'!\[([^\]]*)\]\(\/generated\/[^)]+\)', '[Bild wurde angezeigt]', result)

        return tool_name, result

    async def _send_tts(self, channel: ChannelAdapter, text: str):
        """Generate and send TTS audio in background."""
        try:
            audio_filename = await generate_tts(
                text, Config.TTS_VOICE, Config.GENERATED_AUDIO_DIR
            )
            if audio_filename:
                await channel.send_audio(f"/generated/audio/{audio_filename}")
        except Exception:
            logger.debug("TTS background task failed (client may have disconnected)")
