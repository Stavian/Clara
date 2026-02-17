import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent


class Config:
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "huihui_ai/qwen3-abliterated:14b")
    OLLAMA_EMBEDDING_MODEL: str = os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text")

    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8080"))

    SD_API_URL: str = os.getenv("SD_API_URL", "http://127.0.0.1:7860")
    SD_FORGE_DIR: Path = Path(os.getenv("SD_FORGE_DIR", str(Path.home() / "Desktop" / "stable-diffusion-webui-forge")))

    DB_PATH: Path = BASE_DIR / "data" / "clara.db"
    LOG_DIR: Path = BASE_DIR / "data" / "logs"
    STATIC_DIR: Path = BASE_DIR / "web" / "static"
    GENERATED_IMAGES_DIR: Path = BASE_DIR / "data" / "generated_images"
    GENERATED_AUDIO_DIR: Path = BASE_DIR / "data" / "generated_audio"
    UPLOAD_DIR: Path = BASE_DIR / "data" / "uploads"
    TTS_VOICE: str = os.getenv("TTS_VOICE", "de-DE-KatjaNeural")

    _raw_allowed = os.getenv("ALLOWED_DIRECTORIES", "*").strip()
    ALLOWED_DIRECTORIES: list[str] | None = (
        None if _raw_allowed == "*" else [
            os.path.expanduser(d.strip()) for d in _raw_allowed.split(",")
        ]
    )

    MAX_CONVERSATION_HISTORY: int = int(os.getenv("MAX_CONVERSATION_HISTORY", "20"))
    WEB_REQUEST_TIMEOUT: int = 15
    HEARTBEAT_INTERVAL_MINUTES: int = 5

    # Discord bot (optional)
    DISCORD_BOT_TOKEN: str | None = os.getenv("DISCORD_BOT_TOKEN", None)
    DISCORD_OWNER_ID: str | None = os.getenv("DISCORD_OWNER_ID", None)
    DISCORD_PUBLIC_SKILLS: list[str] = ["web_browse", "web_fetch", "image_generation"]

    SCRIPTS_DIR: Path = BASE_DIR / "data" / "scripts"

    # Agent templates directory (YAML-based, replaces hardcoded AGENTS dict)
    AGENT_TEMPLATES_DIR: Path = BASE_DIR / "data" / "agent_templates"

    # Google Calendar (optional)
    GOOGLE_CREDENTIALS_PATH: Path = BASE_DIR / "data" / "credentials.json"
    GOOGLE_TOKEN_PATH: Path = BASE_DIR / "data" / "google_token.json"
    GOOGLE_CALENDAR_ID: str = os.getenv("GOOGLE_CALENDAR_ID", "primary")
