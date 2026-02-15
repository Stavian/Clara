import os
import logging
from pathlib import Path
from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)


class FileManagerSkill(BaseSkill):
    def __init__(self, allowed_directories: list[str] | None = None):
        self.allowed_directories = allowed_directories

    @property
    def name(self) -> str:
        return "file_manager"

    @property
    def description(self) -> str:
        return "Verwaltet Dateien: Lesen, Schreiben, Auflisten, Erstellen und Loeschen von Dateien und Ordnern."

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["read", "write", "list", "mkdir", "delete", "info"],
                    "description": "Die auszufuehrende Aktion",
                },
                "path": {
                    "type": "string",
                    "description": "Der Dateipfad",
                },
                "content": {
                    "type": "string",
                    "description": "Inhalt zum Schreiben (nur bei action=write)",
                },
            },
            "required": ["action", "path"],
        }

    def _check_access(self, path: str) -> bool:
        if self.allowed_directories is None:
            return True
        resolved = str(Path(path).resolve())
        return any(resolved.startswith(str(Path(d).resolve())) for d in self.allowed_directories)

    async def execute(self, action: str, path: str, content: str = "", **kwargs) -> str:
        path = os.path.expanduser(path)

        if not self._check_access(path):
            return f"Zugriff verweigert: '{path}' liegt nicht in den erlaubten Verzeichnissen."

        try:
            if action == "read":
                p = Path(path)
                if not p.exists():
                    return f"Datei nicht gefunden: {path}"
                text = p.read_text(encoding="utf-8", errors="replace")
                if len(text) > 10000:
                    text = text[:10000] + "\n... (gekuerzt)"
                return text

            elif action == "write":
                p = Path(path)
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(content, encoding="utf-8")
                return f"Datei geschrieben: {path}"

            elif action == "list":
                p = Path(path)
                if not p.exists():
                    return f"Verzeichnis nicht gefunden: {path}"
                entries = sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
                lines = []
                for e in entries[:100]:
                    prefix = "[DIR]  " if e.is_dir() else "[FILE] "
                    size = ""
                    if e.is_file():
                        s = e.stat().st_size
                        size = f" ({s:,} bytes)"
                    lines.append(f"{prefix}{e.name}{size}")
                result = "\n".join(lines)
                if len(entries) > 100:
                    result += f"\n... und {len(entries) - 100} weitere Eintraege"
                return result or "(leeres Verzeichnis)"

            elif action == "mkdir":
                Path(path).mkdir(parents=True, exist_ok=True)
                return f"Verzeichnis erstellt: {path}"

            elif action == "delete":
                p = Path(path)
                if not p.exists():
                    return f"Nicht gefunden: {path}"
                if p.is_file():
                    p.unlink()
                    return f"Datei geloescht: {path}"
                else:
                    import shutil
                    shutil.rmtree(path)
                    return f"Verzeichnis geloescht: {path}"

            elif action == "info":
                p = Path(path)
                if not p.exists():
                    return f"Nicht gefunden: {path}"
                stat = p.stat()
                return (
                    f"Pfad: {p.resolve()}\n"
                    f"Typ: {'Verzeichnis' if p.is_dir() else 'Datei'}\n"
                    f"Groesse: {stat.st_size:,} bytes\n"
                    f"Geaendert: {stat.st_mtime}"
                )

            else:
                return f"Unbekannte Aktion: {action}"

        except Exception as e:
            logger.exception(f"file_manager {action} failed")
            return f"Fehler: {e}"
