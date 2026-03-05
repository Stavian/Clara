import json
import logging
from pathlib import Path

import aiohttp
import yaml

from config import Config
from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)


class N8nDynamicSkill(BaseSkill):
    """A BaseSkill wrapper that executes by calling an n8n webhook.

    Each instance corresponds to one YAML sidecar file in data/n8n_tools/.
    The n8n workflow must return {"result": "<string>"} from its final
    "Respond to Webhook" node.
    """

    def __init__(
        self,
        tool_name: str,
        workflow_name: str,
        webhook_path: str,
        description: str,
        parameters: dict,
        timeout: int = 30,
    ) -> None:
        self._name = tool_name
        self._workflow_name = workflow_name
        self._webhook_path = webhook_path
        self._description = description
        self._parameters = parameters
        self._timeout = timeout

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    @property
    def parameters(self) -> dict:
        return self._parameters

    async def execute(self, **kwargs) -> str:
        webhook_url = (
            f"{Config.N8N_BASE_URL.rstrip('/')}/webhook/{self._webhook_path}"
        )
        # Strip Clara-internal kwargs (e.g. _agent) before sending to n8n
        payload = {k: v for k, v in kwargs.items() if not k.startswith("_")}

        try:
            timeout = aiohttp.ClientTimeout(total=self._timeout)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(webhook_url, json=payload) as resp:
                    if not resp.ok:
                        body = await resp.text()
                        logger.warning(
                            "n8n dynamic skill '%s' webhook error %s: %s",
                            self._name, resp.status, body[:200],
                        )
                        return f"n8n-Tool '{self._name}' Fehler {resp.status}: {body[:300]}"
                    data = await resp.json()
                    if isinstance(data, dict) and "result" in data:
                        return data["result"]
                    return json.dumps(data, ensure_ascii=False)

        except aiohttp.ClientConnectorError:
            return (
                f"n8n nicht erreichbar ({Config.N8N_BASE_URL}). "
                "Laeuft der n8n-Container?"
            )
        except Exception as e:
            logger.exception("N8nDynamicSkill.execute failed for '%s'", self._name)
            return f"Fehler bei n8n-Tool '{self._name}': {e}"


def load_n8n_dynamic_skills(tools_dir: Path) -> list[N8nDynamicSkill]:
    """Read all *.yaml sidecar files and return N8nDynamicSkill instances."""
    skills: list[N8nDynamicSkill] = []
    if not tools_dir.exists():
        logger.debug("n8n_tools dir does not exist yet: %s", tools_dir)
        return skills

    for yaml_file in sorted(tools_dir.glob("*.yaml")):
        try:
            data = yaml.safe_load(yaml_file.read_text("utf-8"))
            skill = N8nDynamicSkill(
                tool_name=data["tool_name"],
                workflow_name=data["workflow_name"],
                webhook_path=data["webhook_path"],
                description=data["description"],
                parameters=data["parameters"],
                timeout=int(data.get("timeout", 30)),
            )
            skills.append(skill)
            logger.info("Loaded n8n dynamic skill: %s", skill.name)
        except Exception as e:
            logger.warning("Failed to load n8n tool YAML %s: %s", yaml_file, e)

    return skills
