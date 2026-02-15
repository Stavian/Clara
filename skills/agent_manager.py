import logging
from skills.base_skill import BaseSkill
from agents.template_loader import AgentTemplate

logger = logging.getLogger(__name__)


class AgentManagerSkill(BaseSkill):
    def __init__(self, agent_router):
        self._router = agent_router

    @property
    def name(self) -> str:
        return "agent_manager"

    @property
    def description(self) -> str:
        return (
            "Verwalte Claras Agenten-Templates. Erstelle, bearbeite, klone und loesche "
            "Agenten-Konfigurationen. Aendere Modell, System-Prompt und Skills pro Agent."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": [
                        "list", "show", "create", "edit", "clone", "delete", "reload",
                    ],
                    "description": (
                        "Aktion: list (alle Agenten auflisten), show (Details eines Agenten), "
                        "create (neuen Agenten erstellen), edit (Agenten bearbeiten), "
                        "clone (Builtin-Agent als Custom kopieren), delete (Custom-Agent loeschen), "
                        "reload (Templates neu laden)"
                    ),
                },
                "agent_name": {
                    "type": "string",
                    "description": "Name des Agenten (fuer show/edit/clone/delete/create)",
                },
                "model": {
                    "type": "string",
                    "description": "Ollama-Modellname (fuer create/edit)",
                },
                "system_prompt": {
                    "type": "string",
                    "description": "System-Prompt fuer den Agenten (fuer create/edit)",
                },
                "description": {
                    "type": "string",
                    "description": "Beschreibung des Agenten (fuer create/edit)",
                },
                "skills": {
                    "type": "string",
                    "description": (
                        "Komma-separierte Liste von Skills (fuer create/edit). "
                        "'all' fuer alle Skills, z.B. 'web_browse,web_fetch'"
                    ),
                },
                "new_name": {
                    "type": "string",
                    "description": "Neuer Name beim Klonen (fuer clone)",
                },
                "max_rounds": {
                    "type": "integer",
                    "description": "Maximale Tool-Runden (fuer create/edit, Standard: 5)",
                },
            },
            "required": ["action"],
        }

    async def execute(self, **kwargs) -> str:
        action = kwargs.get("action", "")

        if action == "list":
            return self._list_agents()
        elif action == "show":
            return self._show_agent(kwargs.get("agent_name", ""))
        elif action == "create":
            return self._create_agent(kwargs)
        elif action == "edit":
            return self._edit_agent(kwargs)
        elif action == "clone":
            return self._clone_agent(
                kwargs.get("agent_name", ""),
                kwargs.get("new_name", ""),
            )
        elif action == "delete":
            return self._delete_agent(kwargs.get("agent_name", ""))
        elif action == "reload":
            return self._reload()
        return f"Unbekannte Aktion: {action}"

    def _list_agents(self) -> str:
        agents = self._router.agents
        if not agents:
            return "Keine Agenten konfiguriert."
        lines = [f"Agenten ({len(agents)}):"]
        for name, tpl in agents.items():
            tag = "[builtin]" if tpl.builtin else "[custom]"
            skills_str = ", ".join(tpl.skills) if tpl.skills else "alle"
            lines.append(f"  - {name} {tag}: {tpl.description} (Modell: {tpl.model}, Skills: {skills_str})")
        return "\n".join(lines)

    def _show_agent(self, agent_name: str) -> str:
        if not agent_name:
            return "Fehler: 'agent_name' ist erforderlich."
        tpl = self._router.agents.get(agent_name)
        if not tpl:
            return f"Agent '{agent_name}' nicht gefunden."
        skills_str = ", ".join(tpl.skills) if tpl.skills else "alle"
        lines = [
            f"Agent: {tpl.name}",
            f"  Typ: {'builtin' if tpl.builtin else 'custom'}",
            f"  Beschreibung: {tpl.description}",
            f"  Modell: {tpl.model}",
            f"  Skills: {skills_str}",
            f"  Max Runden: {tpl.max_rounds}",
            f"  Kontext-Fenster: {tpl.context_window}",
        ]
        if tpl.temperature is not None:
            lines.append(f"  Temperatur: {tpl.temperature}")
        if tpl.system_prompt:
            # Truncate long prompts for display
            prompt_preview = tpl.system_prompt[:200]
            if len(tpl.system_prompt) > 200:
                prompt_preview += "..."
            lines.append(f"  System-Prompt: {prompt_preview}")
        return "\n".join(lines)

    def _create_agent(self, kwargs: dict) -> str:
        agent_name = kwargs.get("agent_name", "")
        model = kwargs.get("model", "")
        desc = kwargs.get("description", "")

        if not agent_name or not model or not desc:
            return "Fehler: 'agent_name', 'model' und 'description' sind erforderlich."

        if agent_name in self._router.agents:
            return f"Fehler: Agent '{agent_name}' existiert bereits."

        skills = self._parse_skills(kwargs.get("skills", ""))
        max_rounds = int(kwargs.get("max_rounds", 5))

        tpl = AgentTemplate(
            name=agent_name,
            description=desc,
            model=model,
            system_prompt=kwargs.get("system_prompt"),
            skills=skills,
            max_rounds=max_rounds,
        )

        self._router.loader.save_template(tpl)
        self._router.reload()
        return f"Agent '{agent_name}' erstellt und geladen."

    def _edit_agent(self, kwargs: dict) -> str:
        agent_name = kwargs.get("agent_name", "")
        if not agent_name:
            return "Fehler: 'agent_name' ist erforderlich."

        tpl = self._router.agents.get(agent_name)
        if not tpl:
            return f"Agent '{agent_name}' nicht gefunden."

        if tpl.builtin:
            return (
                f"Agent '{agent_name}' ist ein Builtin-Agent und kann nicht direkt bearbeitet werden. "
                f"Nutze 'clone' um eine bearbeitbare Kopie zu erstellen."
            )

        changed = []
        if "model" in kwargs and kwargs["model"]:
            tpl.model = kwargs["model"]
            changed.append("model")
        if "system_prompt" in kwargs and kwargs["system_prompt"]:
            tpl.system_prompt = kwargs["system_prompt"]
            changed.append("system_prompt")
        if "description" in kwargs and kwargs["description"]:
            tpl.description = kwargs["description"]
            changed.append("description")
        if "skills" in kwargs and kwargs["skills"]:
            tpl.skills = self._parse_skills(kwargs["skills"])
            changed.append("skills")
        if "max_rounds" in kwargs and kwargs["max_rounds"]:
            tpl.max_rounds = int(kwargs["max_rounds"])
            changed.append("max_rounds")

        if not changed:
            return "Keine Aenderungen angegeben."

        self._router.loader.save_template(tpl)
        self._router.reload()
        return f"Agent '{agent_name}' aktualisiert: {', '.join(changed)}"

    def _clone_agent(self, agent_name: str, new_name: str) -> str:
        if not agent_name:
            return "Fehler: 'agent_name' ist erforderlich."
        if not new_name:
            return "Fehler: 'new_name' ist erforderlich."

        tpl = self._router.agents.get(agent_name)
        if not tpl:
            return f"Agent '{agent_name}' nicht gefunden."

        if new_name in self._router.agents:
            return f"Fehler: Agent '{new_name}' existiert bereits."

        clone = AgentTemplate(
            name=new_name,
            description=tpl.description,
            model=tpl.model,
            system_prompt=tpl.system_prompt,
            skills=list(tpl.skills) if tpl.skills else None,
            max_rounds=tpl.max_rounds,
            temperature=tpl.temperature,
            context_window=tpl.context_window,
            builtin=False,
        )

        self._router.loader.save_template(clone)
        self._router.reload()
        return f"Agent '{agent_name}' als '{new_name}' geklont."

    def _delete_agent(self, agent_name: str) -> str:
        if not agent_name:
            return "Fehler: 'agent_name' ist erforderlich."

        tpl = self._router.agents.get(agent_name)
        if not tpl:
            return f"Agent '{agent_name}' nicht gefunden."

        if tpl.builtin:
            return f"Agent '{agent_name}' ist ein Builtin-Agent und kann nicht geloescht werden."

        if self._router.loader.delete_template(agent_name):
            self._router.reload()
            return f"Agent '{agent_name}' geloescht."
        return f"Fehler beim Loeschen von Agent '{agent_name}'."

    def _reload(self) -> str:
        count = self._router.reload()
        return f"Agenten-Templates neu geladen: {count} Agenten verfuegbar."

    def _parse_skills(self, skills_str: str) -> list[str] | None:
        if not skills_str or skills_str.strip().lower() == "all":
            return None
        return [s.strip() for s in skills_str.split(",") if s.strip()]
