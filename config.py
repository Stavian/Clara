import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent


class Config:
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "huihui_ai/qwen3-abliterated:8b")
    OLLAMA_EMBEDDING_MODEL: str = os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text")

    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8080"))

    SD_API_URL: str = os.getenv("SD_API_URL", "http://127.0.0.1:7860")
    SD_FORGE_DIR: Path = Path(os.getenv("SD_FORGE_DIR", str(Path.home() / "Desktop" / "stable-diffusion-webui-forge")))

    DB_PATH: Path = BASE_DIR / "data" / "clara.db"
    LOG_DIR: Path = BASE_DIR / "data" / "logs"
    STATIC_DIR: Path = BASE_DIR / "web" / "static"
    GENERATED_IMAGES_DIR: Path = BASE_DIR / "data" / "generated_images"

    _raw_allowed = os.getenv("ALLOWED_DIRECTORIES", "~/Documents,~/Downloads").strip()
    ALLOWED_DIRECTORIES: list[str] | None = (
        None if _raw_allowed == "*" else [
            os.path.expanduser(d.strip()) for d in _raw_allowed.split(",")
        ]
    )

    MAX_CONVERSATION_HISTORY: int = int(os.getenv("MAX_CONVERSATION_HISTORY", "20"))
    WEB_REQUEST_TIMEOUT: int = 15
    HEARTBEAT_INTERVAL_MINUTES: int = 5
