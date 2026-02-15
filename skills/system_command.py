import asyncio
import logging
from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)

BLOCKED_COMMANDS = {"rm -rf /", "format", "del /f /s /q C:\\", "shutdown", "reboot"}


class SystemCommandSkill(BaseSkill):
    @property
    def name(self) -> str:
        return "system_command"

    @property
    def description(self) -> str:
        return "Fuehrt Systembefehle auf dem lokalen Rechner aus (z.B. pip, git, dir, type)."

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Der auszufuehrende Befehl",
                },
                "timeout": {
                    "type": "integer",
                    "description": "Timeout in Sekunden (Standard: 30)",
                },
            },
            "required": ["command"],
        }

    async def execute(self, command: str, timeout: int = 30, **kwargs) -> str:
        cmd_lower = command.strip().lower()
        for blocked in BLOCKED_COMMANDS:
            if blocked in cmd_lower:
                return f"Befehl blockiert aus Sicherheitsgruenden: {command}"

        try:
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                process.communicate(), timeout=timeout
            )

            output = ""
            if stdout:
                output += stdout.decode("utf-8", errors="replace")
            if stderr:
                output += "\n[STDERR]\n" + stderr.decode("utf-8", errors="replace")

            if len(output) > 5000:
                output = output[:5000] + "\n... (gekuerzt)"

            return output.strip() or "(Kein Output)"

        except asyncio.TimeoutError:
            return f"Befehl hat das Zeitlimit von {timeout}s ueberschritten."
        except Exception as e:
            logger.exception("system_command failed")
            return f"Fehler: {e}"
