import logging
import base64
import time
from pathlib import Path

import aiohttp

from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)


class ImageGenerationSkill(BaseSkill):
    def __init__(self, sd_api_url: str, output_dir: Path):
        self._sd_api_url = sd_api_url.rstrip("/")
        self._output_dir = output_dir

    @property
    def name(self) -> str:
        return "image_generation"

    @property
    def description(self) -> str:
        return (
            "Generiert ein photorealistisches Bild mit Stable Diffusion. "
            "Der Prompt sollte auf Englisch sein und die Szene beschreiben. "
            "Bilder sehen aus wie echte Smartphone-Fotos."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": (
                        "Bildbeschreibung (englisch), z.B. "
                        "'candid photo of a woman at a coffee shop, natural lighting, shallow depth of field'"
                    ),
                },
                "negative_prompt": {
                    "type": "string",
                    "description": "Was NICHT im Bild sein soll (optional, gute Defaults vorhanden)",
                },
                "width": {
                    "type": "integer",
                    "description": "Bildbreite in Pixeln (Standard: 512)",
                },
                "height": {
                    "type": "integer",
                    "description": "Bildhoehe in Pixeln (Standard: 768)",
                },
                "steps": {
                    "type": "integer",
                    "description": "Sampling-Schritte (Standard: 30)",
                },
            },
            "required": ["prompt"],
        }

    # Default negative prompt tuned for photorealism on DreamShaper 8
    _DEFAULT_NEGATIVE = (
        "(semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime, "
        "animation, comic, illustration, painting, oil painting, artwork, "
        "octane render, cinema 4d, unreal engine, doll, figurine:1.4), "
        "(worst quality, low quality:1.4), bad anatomy, bad proportions, "
        "deformed, disfigured, mutated, extra limb, missing limb, "
        "extra fingers, (mutated hands and fingers:1.3), poorly drawn hands, "
        "poorly drawn face, text, watermark, signature, logo, "
        "professional studio photo, studio lighting, perfect lighting, "
        "perfect composition, airbrushed, overly smooth skin, perfect skin"
    )

    async def execute(
        self,
        prompt: str,
        negative_prompt: str = "",
        width: int = 512,
        height: int = 768,
        steps: int = 30,
        **kwargs,
    ) -> str:
        try:
            self._output_dir.mkdir(parents=True, exist_ok=True)

            if not negative_prompt:
                negative_prompt = self._DEFAULT_NEGATIVE

            # Enhance prompt for realistic phone-photo look
            enhanced_prompt = (
                f"(RAW photo, photorealistic:1.3), (candid photo, shot on iPhone:1.2), "
                f"{prompt}, "
                f"(natural lighting:1.1), (shallow depth of field:1.1), "
                f"realistic skin texture, skin pores, lifelike texture, "
                f"(slight film grain:0.8), authentic, 8k uhd"
            )

            payload = {
                "prompt": enhanced_prompt,
                "negative_prompt": negative_prompt,
                "width": width,
                "height": height,
                "steps": steps,
                "cfg_scale": 7,
                "sampler_name": "DPM++ SDE Karras",
                "batch_size": 1,
                "n_iter": 1,
                "override_settings": {
                    "CLIP_stop_at_last_layers": 2,
                },
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self._sd_api_url}/sdapi/v1/txt2img",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=300),
                ) as resp:
                    if resp.status != 200:
                        error_text = await resp.text()
                        return f"Fehler von Stable Diffusion API (Status {resp.status}): {error_text[:500]}"
                    data = await resp.json()

            images = data.get("images", [])
            if not images:
                return "Stable Diffusion hat kein Bild zurueckgegeben."

            img_data = base64.b64decode(images[0])
            filename = f"img_{int(time.time() * 1000)}.png"
            filepath = self._output_dir / filename
            filepath.write_bytes(img_data)

            logger.info(f"Image generated: {filepath}")
            return f"Bild erfolgreich generiert!\n![Generiertes Bild](/generated/{filename})"

        except aiohttp.ClientConnectorError:
            return "Fehler: Stable Diffusion API ist nicht erreichbar. Bitte starte die WebUI mit --api Flag."
        except Exception as e:
            logger.exception("Image generation failed")
            return f"Fehler bei der Bildgenerierung: {e}"
