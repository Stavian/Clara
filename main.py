import logging
import uvicorn
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
from memory.project_store import ProjectStore
from scheduler.engine import SchedulerEngine
from scheduler.heartbeat import Heartbeat
from web.routes import router, init_routes

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    Config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    Config.LOG_DIR.mkdir(parents=True, exist_ok=True)

    await db.initialize()

    # Register skills
    skills = SkillRegistry()
    skills.register(WebBrowseSkill())
    skills.register(FileManagerSkill(Config.ALLOWED_DIRECTORIES))
    skills.register(TaskSchedulerSkill(scheduler_engine))
    skills.register(SystemCommandSkill())
    skills.register(WebFetchSkill())
    project_store = ProjectStore(db)
    skills.register(ProjectManagerSkill(project_store))

    init_routes(ollama, db, skills)

    # Start scheduler
    await scheduler_engine.start()
    heartbeat = Heartbeat(scheduler_engine)
    await heartbeat.start(Config.HEARTBEAT_INTERVAL_MINUTES)

    logging.info(f"Clara is running at http://{Config.HOST}:{Config.PORT}")
    logging.info(f"Model: {Config.OLLAMA_MODEL}")
    logging.info(f"Allowed directories: {'FULL ACCESS' if Config.ALLOWED_DIRECTORIES is None else Config.ALLOWED_DIRECTORIES}")

    yield

    # Shutdown
    await scheduler_engine.stop()
    await db.close()


app = FastAPI(title="Clara", docs_url=None, redoc_url=None, lifespan=lifespan)
app.include_router(router)
app.mount("/static", StaticFiles(directory=str(Config.STATIC_DIR)), name="static")

if __name__ == "__main__":
    Config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    Config.LOG_DIR.mkdir(parents=True, exist_ok=True)
    uvicorn.run(
        "main:app",
        host=Config.HOST,
        port=Config.PORT,
    )
