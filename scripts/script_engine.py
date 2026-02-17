import re
import logging
import yaml
from pathlib import Path

from config import Config

logger = logging.getLogger(__name__)


class ScriptEngine:
    def __init__(self, skill_registry):
        self.skills = skill_registry
        self.scripts_dir = Config.SCRIPTS_DIR

    async def initialize(self):
        self.scripts_dir.mkdir(parents=True, exist_ok=True)

    async def create(self, name: str, description: str, steps: list[dict]) -> str:
        path = self.scripts_dir / f"{name}.yaml"
        if path.exists():
            return f"Skript '{name}' existiert bereits."
        script = {
            "name": name,
            "description": description,
            "steps": steps,
        }
        path.write_text(
            yaml.dump(script, allow_unicode=True, default_flow_style=False),
            encoding="utf-8",
        )
        return f"Skript '{name}' erstellt mit {len(steps)} Schritten."

    async def delete(self, name: str) -> str:
        path = self.scripts_dir / f"{name}.yaml"
        if not path.exists():
            return f"Skript '{name}' nicht gefunden."
        path.unlink()
        return f"Skript '{name}' geloescht."

    async def list_scripts(self) -> list[dict]:
        result = []
        for f in sorted(self.scripts_dir.glob("*.yaml")):
            try:
                data = yaml.safe_load(f.read_text(encoding="utf-8"))
                result.append({
                    "name": data.get("name", f.stem),
                    "description": data.get("description", ""),
                    "steps": len(data.get("steps", [])),
                })
            except Exception:
                result.append({"name": f.stem, "description": "(Fehler beim Laden)", "steps": 0})
        return result

    async def get(self, name: str) -> dict | None:
        path = self.scripts_dir / f"{name}.yaml"
        if not path.exists():
            return None
        return yaml.safe_load(path.read_text(encoding="utf-8"))

    async def run(self, name: str, variables: dict[str, str] | None = None) -> str:
        script = await self.get(name)
        if not script:
            return f"Skript '{name}' nicht gefunden."

        variables = variables or {}
        steps = script.get("steps", [])
        results = []

        for i, step in enumerate(steps, 1):
            skill_name = step.get("skill", "")
            args = dict(step.get("args", {}))

            # Variable substitution in string args
            for k, v in args.items():
                if isinstance(v, str):
                    args[k] = self._substitute(v, variables)

            result = await self.skills.execute(skill_name, **args)
            results.append(f"Schritt {i} ({skill_name}): {result}")

            # Store result for subsequent steps
            variables[f"step_{i}_result"] = result

            # Stop on error if flag is set
            if step.get("stop_on_error") and result.startswith("Fehler"):
                results.append(f"Skript abgebrochen bei Schritt {i} wegen Fehler.")
                break

        return "\n\n".join(results)

    def _substitute(self, text: str, variables: dict) -> str:
        def replacer(m):
            return variables.get(m.group(1), m.group(0))
        return re.sub(r"\$\{(\w+)\}", replacer, text)
