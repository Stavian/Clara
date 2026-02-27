import logging
import subprocess
import asyncio
import sys
import uvicorn
import aiohttp
from contextlib import asynccontextmanager
from logging.handlers import RotatingFileHandler
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from config import Config


def _setup_logging():
    Config.LOG_DIR.mkdir(parents=True, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    console = logging.StreamHandler()
    console.setFormatter(fmt)

    file_handler = RotatingFileHandler(
        Config.LOG_DIR / "clara.log",
        maxBytes=10 * 1024 * 1024,  # 10 MB per file
        backupCount=7,
        encoding="utf-8",
    )
    file_handler.setFormatter(fmt)

    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.addHandler(console)
    root.addHandler(file_handler)


def _handle_unhandled_exception(exc_type, exc_value, exc_traceback):
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return
    logging.critical("Unhandled exception", exc_info=(exc_type, exc_value, exc_traceback))


sys.excepthook = _handle_unhandled_exception
_setup_logging()

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
from skills.webhook_manager import WebhookManagerSkill
from skills.automation_manager import AutomationManagerSkill
from skills.batch_script import BatchScriptSkill
from skills.screenshot import ScreenshotSkill
from skills.clipboard import ClipboardSkill
from skills.pdf_reader import PDFReaderSkill
from skills.calculator import CalculatorSkill
from skills.calendar_manager import CalendarManagerSkill
from memory.project_store import ProjectStore
from scheduler.engine import SchedulerEngine
from scheduler.heartbeat import Heartbeat
from agents.agent_router import AgentRouter
from chat.engine import ChatEngine
from web.routes import router, init_routes, SYSTEM_PROMPT, limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from automation.event_bus import EventBus
from automation.automation_engine import AutomationEngine
from webhook.manager import WebhookManager
from webhook.routes import webhook_router, init_webhook_routes
from notifications.notification_service import NotificationService
from scripts.script_engine import ScriptEngine
from workspace.loader import WorkspaceLoader, DEFAULTS


db = Database(Config.DB_PATH)
ollama = OllamaClient(
    base_url=Config.OLLAMA_BASE_URL,
    model=Config.OLLAMA_MODEL,
    embedding_model=Config.OLLAMA_EMBEDDING_MODEL,
)
event_bus = EventBus()
notification_service = NotificationService()
scheduler_engine = SchedulerEngine(db=db, event_bus=event_bus)
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
    # Support both Windows (Scripts/) and Linux (bin/) venv layouts
    venv_python_win = Config.SD_FORGE_DIR / "venv" / "Scripts" / "python.exe"
    venv_python_lin = Config.SD_FORGE_DIR / "venv" / "bin" / "python"
    venv_python = venv_python_win if venv_python_win.exists() else venv_python_lin

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

    # Start Stable Diffusion in background (only if SD_ENABLED=true in .env)
    sd_task = asyncio.create_task(_start_stable_diffusion()) if Config.SD_ENABLED else None

    # Initialize Phase 11 subsystems
    notification_service.set_db(db)
    await notification_service.initialize_table()

    webhook_manager = WebhookManager(db, event_bus)
    await webhook_manager.initialize()
    init_webhook_routes(webhook_manager)

    # Register core skills
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
    if Config.SD_ENABLED:
        skills.register(ImageGenerationSkill(Config.SD_API_URL, Config.GENERATED_IMAGES_DIR))
    skills.register(MemoryManagerSkill(db))

    # Register Phase 12 skills
    skills.register(ScreenshotSkill(Config.GENERATED_IMAGES_DIR))
    skills.register(ClipboardSkill())
    skills.register(PDFReaderSkill())
    skills.register(CalculatorSkill())
    skills.register(CalendarManagerSkill())

    # Initialize Phase 11 engines (need skills registry)
    script_engine = ScriptEngine(skills)
    await script_engine.initialize()

    automation_engine = AutomationEngine(db, event_bus)
    automation_engine.skill_registry = skills
    automation_engine.notification_service = notification_service
    automation_engine.script_engine = script_engine
    await automation_engine.initialize()

    # Register Phase 11 skills
    skills.register(WebhookManagerSkill(webhook_manager))
    skills.register(AutomationManagerSkill(automation_engine, event_bus))
    skills.register(BatchScriptSkill(script_engine))

    # Wire skill_registry into scheduler
    scheduler_engine.skill_registry = skills
    scheduler_engine.notification_service = notification_service

    # ── Workspace System (Phase 27) ───────────────────────────────────────────
    # Creates per-agent workspace dirs with IDENTITY.md, SOUL.md, TOOLS.md, etc.
    # on first run, then injects them into every system prompt at runtime.
    workspace_loader = WorkspaceLoader(Config.AGENTS_WORKSPACE_DIR)

    # Load agent templates to know which agents to create workspaces for
    from agents.template_loader import TemplateLoader as _TLoader
    _all_agents = _TLoader(Config.AGENT_TEMPLATES_DIR).load_all()
    for _agent_name in _all_agents:
        workspace_loader.ensure_workspace(_agent_name, DEFAULTS.get(_agent_name, {
            "IDENTITY.md": f"# Identity\nName: Clara ({_agent_name})\n",
            "SOUL.md": "# Soul\n",
            "MEMORY.md": "# Agenten-Notizen\n",
            "BOOT.md": "",
        }))
        # Regenerate TOOLS.md from live skill registry every startup
        workspace_loader.generate_tools_md(_agent_name, skills.get_all())

    # Bootstrap: create BOOTSTRAP.md only on a completely fresh install (0 messages)
    total_messages = await db.get_total_message_count()
    if total_messages == 0:
        workspace_loader.ensure_bootstrap("general")
        logging.info("Fresh install detected — bootstrap ritual created for 'general' agent")
    # ─────────────────────────────────────────────────────────────────────────

    agent_router = AgentRouter(ollama, skills, workspace_loader=workspace_loader)

    # Create the shared chat engine
    chat_engine = ChatEngine(ollama, db, skills, agent_router, SYSTEM_PROMPT, workspace_loader=workspace_loader)
    notification_service.set_chat_engine(chat_engine)
    init_routes(
        chat_engine,
        ollama=ollama,
        db=db,
        event_bus=event_bus,
        scheduler_engine=scheduler_engine,
        sd_check_fn=_is_sd_running if Config.SD_ENABLED else None,
        project_store=project_store,
    )

    # Start scheduler
    await scheduler_engine.start()
    heartbeat = Heartbeat(
        scheduler_engine,
        event_bus=event_bus,
        notification_service=notification_service,
        db=db,
    )
    await heartbeat.start(Config.HEARTBEAT_INTERVAL_MINUTES)

    # Check agent model availability
    await _check_agent_models(agent_router)

    # Optionally start Discord bot
    discord_bot = None
    if Config.DISCORD_BOT_TOKEN:
        try:
            from discord_bot.bot import ClaraDiscordBot
            discord_bot = ClaraDiscordBot(Config.DISCORD_BOT_TOKEN, chat_engine)
            notification_service.set_discord_bot(discord_bot)
            asyncio.create_task(discord_bot.start())
            logging.info("Discord bot starting...")
        except Exception:
            logging.exception("Failed to start Discord bot")
    else:
        logging.info("No DISCORD_BOT_TOKEN set, Discord bot disabled")

    logging.info(f"Clara is running at http://{Config.HOST}:{Config.PORT}")
    logging.info(f"Main model: {Config.OLLAMA_MODEL}")
    logging.info(f"Agents: {', '.join(agent_router.agents.keys())}")
    logging.info(f"Skills: {', '.join(s.name for s in skills.get_all())}")
    logging.info(f"Workspace: {Config.AGENTS_WORKSPACE_DIR}")
    logging.info(f"Allowed directories: {'FULL ACCESS' if Config.ALLOWED_DIRECTORIES is None else Config.ALLOWED_DIRECTORIES}")

    yield

    # Shutdown
    if discord_bot:
        await discord_bot.close()
    await heartbeat.stop()
    if sd_task:
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
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.include_router(router)
app.include_router(webhook_router)
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
