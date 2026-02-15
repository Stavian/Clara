import os
import logging
from dataclasses import dataclass, field, asdict
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)


@dataclass
class AgentTemplate:
    name: str
    description: str
    model: str
    system_prompt: str | None = None
    skills: list[str] | None = None  # None = all skills
    max_rounds: int = 5
    temperature: float | None = None
    context_window: int = 4
    builtin: bool = field(default=False, repr=False)

    def to_dict(self) -> dict:
        """Return a serialisable dict (excludes internal fields)."""
        d = asdict(self)
        d.pop("builtin", None)
        # Drop None values for cleaner YAML
        return {k: v for k, v in d.items() if v is not None}


class TemplateLoader:
    BUILTIN_SUBDIR = "_builtin"
    CUSTOM_SUBDIR = "custom"

    def __init__(self, templates_dir: Path):
        self.templates_dir = templates_dir
        self._ensure_dirs()

    def _ensure_dirs(self):
        (self.templates_dir / self.BUILTIN_SUBDIR).mkdir(parents=True, exist_ok=True)
        (self.templates_dir / self.CUSTOM_SUBDIR).mkdir(parents=True, exist_ok=True)

    def load_all(self) -> dict[str, AgentTemplate]:
        """Load builtin templates first, then overlay custom ones."""
        agents: dict[str, AgentTemplate] = {}

        for subdir, is_builtin in [
            (self.BUILTIN_SUBDIR, True),
            (self.CUSTOM_SUBDIR, False),
        ]:
            path = self.templates_dir / subdir
            for file in sorted(path.glob("*.yaml")):
                try:
                    tpl = self._parse(file, is_builtin)
                    agents[tpl.name] = tpl
                    logger.info(
                        f"Loaded {'builtin' if is_builtin else 'custom'} agent template: {tpl.name}"
                    )
                except Exception:
                    logger.exception(f"Failed to load agent template: {file}")

        return agents

    def _parse(self, path: Path, is_builtin: bool) -> AgentTemplate:
        data = yaml.safe_load(path.read_text("utf-8"))

        # Resolve model from env var if specified
        if env_key := data.pop("model_env", None):
            data["model"] = os.getenv(env_key, data.get("model", ""))

        # Only keep fields that AgentTemplate accepts
        valid_fields = {f.name for f in AgentTemplate.__dataclass_fields__.values()}
        filtered = {k: v for k, v in data.items() if k in valid_fields}
        filtered["builtin"] = is_builtin

        return AgentTemplate(**filtered)

    def save_template(self, template: AgentTemplate) -> Path:
        """Save a template to the custom directory."""
        dest = self.templates_dir / self.CUSTOM_SUBDIR / f"{template.name}.yaml"
        dest.write_text(yaml.dump(template.to_dict(), allow_unicode=True, sort_keys=False), "utf-8")
        logger.info(f"Saved custom agent template: {template.name}")
        return dest

    def delete_template(self, name: str) -> bool:
        """Delete a custom template. Returns True if deleted."""
        path = self.templates_dir / self.CUSTOM_SUBDIR / f"{name}.yaml"
        if path.exists():
            path.unlink()
            logger.info(f"Deleted custom agent template: {name}")
            return True
        return False
