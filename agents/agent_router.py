import re
import logging

from config import Config
from llm.ollama_client import OllamaClient
from skills.skill_registry import SkillRegistry
from chat.engine import _strip_think
from agents.template_loader import AgentTemplate, TemplateLoader
from workspace.loader import WorkspaceLoader

logger = logging.getLogger(__name__)


class AgentRouter:
    def __init__(self, ollama: OllamaClient, skills: SkillRegistry, workspace_loader: WorkspaceLoader | None = None):
        self.ollama = ollama
        self.skills = skills
        self.workspace_loader = workspace_loader
        self.loader = TemplateLoader(Config.AGENT_TEMPLATES_DIR)
        self.agents: dict[str, AgentTemplate] = self.loader.load_all()

    def reload(self) -> int:
        """Reload all agent templates from disk. Returns the agent count."""
        self.agents = self.loader.load_all()
        logger.info(f"Reloaded {len(self.agents)} agent templates")
        return len(self.agents)

    def get_delegate_tool_definition(self, filter_agents: list[str] | None = None) -> dict:
        """Build the delegate_to_agent tool definition.

        Args:
            filter_agents: If provided, only these agent names are offered.
                           If None, all non-general agents are available.
        """
        available = {
            name: tpl for name, tpl in self.agents.items()
            if name != "general"
            and (filter_agents is None or name in filter_agents)
        }

        if not available:
            return None

        agent_descriptions = "\n".join(
            f"- {name}: {tpl.description}"
            for name, tpl in available.items()
        )
        return {
            "type": "function",
            "function": {
                "name": "delegate_to_agent",
                "description": (
                    "Delegiere eine Aufgabe an einen spezialisierten Agenten. "
                    "Nutze dies NUR wenn die Aufgabe klar von einem Spezialisten profitiert. "
                    "Einfache Fragen beantwortest du selbst direkt.\n"
                    f"Verfuegbare Agenten:\n{agent_descriptions}"
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "agent": {
                            "type": "string",
                            "enum": list(available.keys()),
                            "description": "Welcher Spezialist die Aufgabe uebernehmen soll",
                        },
                        "task": {
                            "type": "string",
                            "description": (
                                "Klare Beschreibung der Aufgabe mit allem relevanten Kontext "
                                "aus der Nutzeranfrage"
                            ),
                        },
                    },
                    "required": ["agent", "task"],
                },
            },
        }

    def get_tools_for_agent(self, agent_name: str) -> list[dict]:
        tpl = self.agents.get(agent_name)
        if not tpl:
            return self.skills.get_tool_definitions()

        if tpl.skills is None:
            return self.skills.get_tool_definitions()

        return [
            skill.to_tool_definition()
            for skill in self.skills.get_all()
            if skill.name in tpl.skills
        ]

    def get_allowed_agents(self, allowed_skills: list[str]) -> list[str]:
        """Return agent names whose skills are all within allowed_skills."""
        allowed = []
        for name, tpl in self.agents.items():
            if name == "general":
                continue
            if tpl.skills is None:
                continue
            if all(s in allowed_skills for s in tpl.skills):
                allowed.append(name)
        return allowed

    async def run_agent(
        self,
        agent_name: str,
        task: str,
        conversation_context: list[dict] | None = None,
    ) -> tuple[str, list[dict]]:
        """Run a specialist agent.

        Returns (text_response, tool_events) where tool_events is a list of
        dicts to forward to the frontend (tool_call notifications, images).
        """
        tpl = self.agents.get(agent_name)
        if not tpl:
            return f"Fehler: Agent '{agent_name}' nicht gefunden.", []

        model = tpl.model
        system_prompt = tpl.system_prompt or ""
        events: list[dict] = []

        logger.info(f"Running agent '{agent_name}' with model '{model}'")

        # Inject workspace context (IDENTITY.md, SOUL.md, TOOLS.md, MEMORY.md, BOOT.md)
        if self.workspace_loader:
            workspace_ctx = self.workspace_loader.build_context(agent_name)
            full_system = system_prompt + workspace_ctx
        else:
            full_system = system_prompt

        messages = []
        if full_system:
            messages.append({"role": "system", "content": full_system})

        if conversation_context:
            ctx_limit = tpl.context_window
            for msg in conversation_context[-ctx_limit:]:
                if msg["role"] in ("user", "assistant"):
                    messages.append(msg)

        messages.append({"role": "user", "content": task})

        tools = self.get_tools_for_agent(agent_name)

        # Build optional Ollama options
        options = {}
        if tpl.temperature is not None:
            options["temperature"] = tpl.temperature

        max_rounds = tpl.max_rounds
        response = {}
        for _ in range(max_rounds):
            response = await self.ollama.chat(
                messages, tools=tools or None, model=model,
                options=options or None,
            )

            if response.get("tool_calls"):
                for tool_call in response["tool_calls"]:
                    fn = tool_call.get("function", {})
                    tool_name = fn.get("name", "")
                    tool_args = fn.get("arguments", {})

                    skill = self.skills.get(tool_name)
                    if skill:
                        valid_params = set(skill.parameters.get("properties", {}).keys())
                        tool_args = {k: v for k, v in tool_args.items() if k in valid_params}

                    events.append({
                        "type": "tool_call",
                        "tool": f"{agent_name}:{tool_name}",
                        "args": tool_args,
                    })

                    result = await self.skills.execute(tool_name, _agent=agent_name, **tool_args)

                    # Extract images from tool result
                    img_matches = re.findall(
                        r'!\[([^\]]*)\]\((\/generated\/[^)]+)\)', result or ""
                    )
                    for alt, src in img_matches:
                        events.append({"type": "image", "src": src, "alt": alt})

                    # Strip image markdown so the agent LLM doesn't repeat it
                    if img_matches:
                        result = re.sub(r'!\[([^\]]*)\]\(\/generated\/[^)]+\)', '[Bild wurde angezeigt]', result)

                    messages.append({
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [tool_call],
                    })
                    messages.append({
                        "role": "tool",
                        "name": tool_name,
                        "content": result,
                    })
            else:
                break

        text = _strip_think(response.get("content", ""))
        if not text:
            messages.append({
                "role": "user",
                "content": "Fasse die Ergebnisse zusammen und beantworte die Aufgabe.",
            })
            response = await self.ollama.chat(messages, tools=None, model=model)
            text = _strip_think(response.get("content", ""))

        logger.info(f"Agent '{agent_name}' finished. Response length: {len(text)}")
        return text or "Der Agent konnte keine Antwort generieren.", events
