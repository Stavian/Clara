import asyncio
import logging
import time
from pathlib import Path

import mss
import mss.tools

from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)


class ScreenshotSkill(BaseSkill):
    def __init__(self, output_dir: Path):
        self._output_dir = output_dir

    @property
    def name(self) -> str:
        return "screenshot"

    @property
    def description(self) -> str:
        return (
            "Erstellt einen Screenshot vom Bildschirm. "
            "Kann den gesamten Bildschirm, einen bestimmten Monitor "
            "oder einen bestimmten Bereich erfassen."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["full_screen", "monitor", "region"],
                    "description": (
                        "Art des Screenshots: 'full_screen' (alle Monitore), "
                        "'monitor' (bestimmter Monitor), 'region' (bestimmter Bereich)"
                    ),
                },
                "monitor": {
                    "type": "integer",
                    "description": "Monitor-Index (1 = erster Monitor). Nur bei action='monitor'.",
                },
                "x": {"type": "integer", "description": "X-Koordinate oben links. Nur bei action='region'."},
                "y": {"type": "integer", "description": "Y-Koordinate oben links. Nur bei action='region'."},
                "width": {"type": "integer", "description": "Breite in Pixeln. Nur bei action='region'."},
                "height": {"type": "integer", "description": "Hoehe in Pixeln. Nur bei action='region'."},
            },
            "required": ["action"],
        }

    async def execute(self, action: str = "full_screen", **kwargs) -> str:
        try:
            self._output_dir.mkdir(parents=True, exist_ok=True)
            loop = asyncio.get_event_loop()
            filename = f"screenshot_{int(time.time() * 1000)}.png"
            filepath = self._output_dir / filename

            if action == "monitor":
                monitor_idx = kwargs.get("monitor", 1)
                await loop.run_in_executor(None, self._capture_monitor, monitor_idx, filepath)
            elif action == "region":
                x = kwargs.get("x", 0)
                y = kwargs.get("y", 0)
                width = kwargs.get("width", 800)
                height = kwargs.get("height", 600)
                await loop.run_in_executor(None, self._capture_region, x, y, width, height, filepath)
            else:
                await loop.run_in_executor(None, self._capture_full, filepath)

            return f"Screenshot erstellt.\n![Screenshot](/generated/{filename})"
        except Exception as e:
            logger.exception("Screenshot failed")
            return f"Fehler beim Screenshot: {e}"

    @staticmethod
    def _capture_full(filepath: Path):
        with mss.mss() as sct:
            # monitor 0 = all monitors combined
            shot = sct.grab(sct.monitors[0])
            mss.tools.to_png(shot.rgb, shot.size, output=str(filepath))

    @staticmethod
    def _capture_monitor(monitor_idx: int, filepath: Path):
        with mss.mss() as sct:
            if monitor_idx < 1 or monitor_idx >= len(sct.monitors):
                raise ValueError(f"Monitor {monitor_idx} nicht gefunden. Verfuegbar: 1-{len(sct.monitors)-1}")
            shot = sct.grab(sct.monitors[monitor_idx])
            mss.tools.to_png(shot.rgb, shot.size, output=str(filepath))

    @staticmethod
    def _capture_region(x: int, y: int, width: int, height: int, filepath: Path):
        with mss.mss() as sct:
            region = {"left": x, "top": y, "width": width, "height": height}
            shot = sct.grab(region)
            mss.tools.to_png(shot.rgb, shot.size, output=str(filepath))
