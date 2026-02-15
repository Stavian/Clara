import logging
import subprocess
import asyncio
import uvicorn
import aiohttp
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from config import Config
from llm.ollama_client import OllamaClient
from memory.database import Database
from skills.skill_registry import SkillRegistry
from skills.web_browse import WebBrowseSkill
from skills.file_manager import FileManagerSkill
from skills.task_scheduler import TaskSchedulerSkill
from skills.system_command import SystemCommandSkill
from skills.web_fetch import WebFetchSkill
from skills.project_manager import ProjectManagerSkill
from skills.image_generation import ImageGenerationSkill
from skills.memory_manager import MemoryManagerSkill
from skills.agent_manager import AgentManagerSkill
from memory.project_store import ProjectStore
from scheduler.engine import SchedulerEngine
from scheduler.heartbeat import Heartbeat
from agents.agent_router import AgentRouter
from chat.engine import ChatEngine
from web.routes import router, init_routes, SYSTEM_PROMPT

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

db = Database(Config.DB_PATH)
ollama = OllamaClient(
    base_url=Config.OLLAMA_BASE_URL,
    model=Config.OLLAMA_MODEL,
    embedding_model=Config.OLLAMA_EMBEDDING_MODEL,
)
scheduler_engine = SchedulerEngine()
_sd_process = None


async def _is_sd_running() -> bool:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{Config.SD_API_URL}/sdapi/v1/sd-models",
                timeout=aiohttp.ClientTimeout(total=3),
            ) as resp:
                return resp.status == 200
    except Exception:
        return False


async def _start_stable_diffusion():
    global _sd_process
    if await _is_sd_running():
        logging.info("Stable Diffusion is already running")
        return

    launch_py = Config.SD_FORGE_DIR / "launch.py"
    venv_python = Config.SD_FORGE_DIR / "venv" / "Scripts" / "python.exe"

    if not launch_py.exists():
        logging.warning(f"Stable Diffusion not found at {Config.SD_FORGE_DIR}")
        return

    python = str(venv_python) if venv_python.exists() else "python"

    logging.info("Starting Stable Diffusion Forge...")
    _sd_process = subprocess.Popen(
        [python, str(launch_py), "--api", "--xformers"],
        cwd=str(Config.SD_FORGE_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    for i in range(60):
        await asyncio.sleep(5)
        if await _is_sd_running():
            logging.info("Stable Diffusion is ready")
            return
    logging.warning("Stable Diffusion did not become ready within 5 minutes")


async def _check_agent_models(agent_router):
    """Log which agent models are available and warn about missing ones."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{Config.OLLAMA_BASE_URL}/api/tags",
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                if resp.status != 200:
                    logging.warning("Could not check available models")
                    return
                data = await resp.json()
                installed = {m["name"] for m in data.get("models", [])}
    except Exception:
        logging.warning("Could not connect to Ollama to check agent models")
        return

    for agent_name, tpl in agent_router.agents.items():
        model = tpl.model
        # Ollama may list with or without :latest tag
        found = model in installed or f"{model}:latest" in installed
        if found:
            logging.info(f"Agent '{agent_name}': model '{model}' OK")
        else:
            logging.warning(
                f"Agent '{agent_name}': model '{model}' NOT FOUND. "
                f"Run: ollama pull {model}"
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    Config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    Config.LOG_DIR.mkdir(parents=True, exist_ok=True)

    await db.initialize()

    # Start Stable Diffusion in background
    sd_task = asyncio.create_task(_start_stable_diffusion())

    # Register skills
    skills = SkillRegistry()
    skills.register(WebBrowseSkill())
    skills.register(FileManagerSkill(Config.ALLOWED_DIRECTORIES))
    skills.register(TaskSchedulerSkill(scheduler_engine))
    skills.register(SystemCommandSkill())
    skills.register(WebFetchSkill())
    project_store = ProjectStore(db)
    skills.register(ProjectManagerSkill(project_store))
    Config.GENERATED_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    Config.GENERATED_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    Config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    skills.register(ImageGenerationSkill(Config.SD_API_URL, Config.GENERATED_IMAGES_DIR))
    skills.register(MemoryManagerSkill(db))

    agent_router = AgentRouter(ollama, skills)
    skills.register(AgentManagerSkill(agent_router))

    # Create the shared chat engine
    chat_engine = ChatEngine(ollama, db, skills, agent_router, SYSTEM_PROMPT)
    init_routes(chat_engine, ollama)

    # Start scheduler
    await scheduler_engine.start()
    heartbeat = Heartbeat(scheduler_engine)
    await heartbeat.start(Config.HEARTBEAT_INTERVAL_MINUTES)

    # Check agent model availability
    await _check_agent_models(agent_router)

    # Optionally start Discord bot
    discord_bot = None
    if Config.DISCORD_BOT_TOKEN:
        try:
            from discord_bot.bot import ClaraDiscordBot
            discord_bot = ClaraDiscordBot(Config.DISCORD_BOT_TOKEN, chat_engine)
            asyncio.create_task(discord_bot.start())
            logging.info("Discord bot starting...")
        except Exception:
            logging.exception("Failed to start Discord bot")
    else:
        logging.info("No DISCORD_BOT_TOKEN set, Discord bot disabled")

    logging.info(f"Clara is running at http://{Config.HOST}:{Config.PORT}")
    logging.info(f"Main model: {Config.OLLAMA_MODEL}")
    logging.info(f"Agents: {', '.join(agent_router.agents.keys())}")
    logging.info(f"Allowed directories: {'FULL ACCESS' if Config.ALLOWED_DIRECTORIES is None else Config.ALLOWED_DIRECTORIES}")

    yield

    # Shutdown
    if discord_bot:
        await discord_bot.close()
    sd_task.cancel()
    if _sd_process and _sd_process.poll() is None:
        logging.info("Stopping Stable Diffusion...")
        _sd_process.terminate()
    await scheduler_engine.stop()
    await ollama.close()
    await db.close()


Config.GENERATED_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
Config.GENERATED_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
Config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="Clara", docs_url=None, redoc_url=None, lifespan=lifespan)
app.include_router(router)
app.mount("/generated/audio", StaticFiles(directory=str(Config.GENERATED_AUDIO_DIR)), name="generated_audio")
app.mount("/generated", StaticFiles(directory=str(Config.GENERATED_IMAGES_DIR)), name="generated")
app.mount("/uploads", StaticFiles(directory=str(Config.UPLOAD_DIR)), name="uploads")
app.mount("/static", StaticFiles(directory=str(Config.STATIC_DIR)), name="static")

if __name__ == "__main__":
    Config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    Config.LOG_DIR.mkdir(parents=True, exist_ok=True)
    uvicorn.run(
        "main:app",
        host=Config.HOST,
        port=Config.PORT,
    )
