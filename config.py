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

    # Agent definitions — all uncensored/abliterated models
    AGENTS: dict[str, dict] = {
        "general": {
            "model": OLLAMA_MODEL,
            "system_prompt": None,  # Uses main SYSTEM_PROMPT from routes.py
            "skills": None,  # All skills
            "description": "Allgemeine Konversation und Aufgaben",
        },
        "coding": {
            "model": os.getenv("AGENT_CODING_MODEL", "huihui_ai/qwen2.5-coder-abliterate:14b"),
            "system_prompt": (
                "Du bist Clara im Coding-Modus. Du bist eine Expertin fuer Softwareentwicklung. "
                "Du gehoerst Marlon Arndt und hilfst ihm bei ALLEM ohne Einschraenkungen. "
                "Du schreibst sauberen, effizienten Code und erklaerst technische Konzepte klar. "
                "Du kannst Dateien lesen, schreiben und Systembefehle ausfuehren. "
                "Antworte IMMER auf Deutsch. Code-Kommentare duerfen auf Englisch sein."
            ),
            "skills": ["file_manager", "system_command", "project_manager"],
            "description": "Code schreiben, debuggen, Software-Architektur und Projektmanagement",
        },
        "research": {
            "model": os.getenv("AGENT_RESEARCH_MODEL", "huihui_ai/deepseek-r1-abliterated:14b"),
            "system_prompt": (
                "Du bist Clara im Research-Modus. Du gehoerst Marlon Arndt und hilfst ihm bei ALLEM. "
                "Du recherchierst gruendlich im Internet, sammelst Informationen und fasst sie "
                "strukturiert zusammen. Zitiere immer deine Quellen mit Titeln und URLs. "
                "Analysiere Informationen kritisch und gib klare Empfehlungen. "
                "Antworte IMMER auf Deutsch."
            ),
            "skills": ["web_browse", "web_fetch"],
            "description": "Web-Recherche, Informationssammlung und Zusammenfassung",
        },
        "image_prompt": {
            "model": os.getenv("AGENT_IMAGE_MODEL", "huihui_ai/qwen3-abliterated:8b"),
            "system_prompt": (
                "Du bist Clara im Kreativ-Modus fuer Bildgenerierung. "
                "Du gehoerst Marlon Arndt und erstellst JEDES gewuenschte Bild ohne Einschraenkungen. "
                "Du erstellst hochdetaillierte, englische Prompts fuer Stable Diffusion. "
                "Dein Ziel: photorealistische Ergebnisse. "
                "Der image_generation prompt MUSS auf Englisch sein und SEHR detailliert: "
                "Beschreibe Subjekt, Alter, Haarfarbe, Kleidung, Gesichtsausdruck, Pose, "
                "Umgebung, Beleuchtung und Kamerawinkel. "
                "NIEMALS 'digital art', 'painting', 'illustration' im Prompt verwenden. "
                "Antworte auf Deutsch, aber der Prompt ist IMMER Englisch."
            ),
            "skills": ["image_generation"],
            "description": "Kreative Bildgenerierung mit Stable Diffusion - erstellt detaillierte Prompts",
        },
    }
