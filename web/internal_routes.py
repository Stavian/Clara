import logging
import yaml
from pathlib import Path
from fastapi import APIRouter, Request, HTTPException, Depends

from config import Config

logger = logging.getLogger(__name__)

internal_router = APIRouter(prefix="/internal")

_skills = None  # Injected at startup via init_internal_routes()


def init_internal_routes(skill_registry) -> None:
    global _skills
    _skills = skill_registry


async def _require_internal(request: Request) -> None:
    """Dependency: allow only trusted IPs + correct API key."""
    client_ip = request.client.host if request.client else ""
    if client_ip not in Config.INTERNAL_API_ALLOWED_IPS:
        logger.warning("Internal API: rejected request from %s", client_ip)
        raise HTTPException(403, "Forbidden")
    if Config.INTERNAL_API_KEY:
        key = request.headers.get("X-Clara-Internal-Key", "")
        if key != Config.INTERNAL_API_KEY:
            raise HTTPException(401, "Unauthorized")


@internal_router.post("/skill/{skill_name}", dependencies=[Depends(_require_internal)])
async def proxy_skill(skill_name: str, request: Request) -> dict:
    """Generic proxy: n8n calls this to execute any registered Clara skill."""
    if _skills is None:
        raise HTTPException(503, "Skill registry not initialised")

    skill = _skills.get(skill_name)
    if skill is None:
        raise HTTPException(404, f"Skill '{skill_name}' not found")

    try:
        body = await request.json()
    except Exception:
        body = {}

    result = await _skills.execute(skill_name, **body)
    return {"result": result}


@internal_router.post("/n8n_tool_schema", dependencies=[Depends(_require_internal)])
async def register_n8n_tool_schema(request: Request) -> dict:
    """Write a sidecar YAML for a new n8n tool and hot-register it in SkillRegistry."""
    from skills.n8n_dynamic import N8nDynamicSkill

    try:
        data = await request.json()
    except Exception as e:
        raise HTTPException(400, f"Invalid JSON: {e}")

    required = ["tool_name", "workflow_name", "webhook_path", "description", "parameters"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        raise HTTPException(400, f"Missing fields: {', '.join(missing)}")

    tool_name: str = data["tool_name"]
    schema = {
        "tool_name": tool_name,
        "workflow_name": data["workflow_name"],
        "webhook_path": data["webhook_path"],
        "description": data["description"],
        "timeout": int(data.get("timeout", 30)),
        "parameters": data["parameters"],
    }

    # Write YAML sidecar
    Config.N8N_TOOLS_DIR.mkdir(parents=True, exist_ok=True)
    yaml_path: Path = Config.N8N_TOOLS_DIR / f"{tool_name}.yaml"
    yaml_path.write_text(yaml.dump(schema, allow_unicode=True, sort_keys=False), "utf-8")
    logger.info("Wrote n8n tool schema: %s", yaml_path)

    # Hot-register in SkillRegistry (skip if already registered)
    if _skills is not None and not _skills.get(tool_name):
        skill = N8nDynamicSkill(
            tool_name=schema["tool_name"],
            workflow_name=schema["workflow_name"],
            webhook_path=schema["webhook_path"],
            description=schema["description"],
            parameters=schema["parameters"],
            timeout=schema["timeout"],
        )
        _skills.register(skill)
        logger.info("Hot-registered n8n dynamic skill: %s", tool_name)

    return {"status": "ok", "tool_name": tool_name, "yaml_path": str(yaml_path)}
