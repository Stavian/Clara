import logging
from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)


class SkillRegistry:
    def __init__(self):
        self._skills: dict[str, BaseSkill] = {}

    def register(self, skill: BaseSkill):
        self._skills[skill.name] = skill
        logger.info(f"Skill registered: {skill.name}")

    def get(self, name: str) -> BaseSkill | None:
        return self._skills.get(name)

    def get_all(self) -> list[BaseSkill]:
        return list(self._skills.values())

    def get_tool_definitions(self) -> list[dict]:
        return [skill.to_tool_definition() for skill in self._skills.values()]

    async def execute(self, name: str, **kwargs) -> str:
        skill = self._skills.get(name)
        if not skill:
            return f"Fehler: Skill '{name}' nicht gefunden."
        try:
            return await skill.execute(**kwargs)
        except Exception as e:
            logger.exception(f"Skill '{name}' failed")
            return f"Fehler bei '{name}': {e}"
