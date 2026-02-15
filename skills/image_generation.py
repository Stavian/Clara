import logging
import base64
import re
import time
from pathlib import Path

import aiohttp

from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)

VISION_MODEL = "moondream"
OLLAMA_BASE_URL = "http://localhost:11434"
MAX_ATTEMPTS = 3


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
            "Der Prompt MUSS auf Englisch sein und die Szene beschreiben. "
            "Bilder sehen aus wie echte Smartphone-Fotos. "
            "Gib NUR den prompt-Parameter an, alle anderen Einstellungen sind optimiert. "
            "Das Bild wird automatisch analysiert und bei schlechter Qualitaet bis zu 3x neu generiert."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": (
                        "Scene description in ENGLISH only. MUST be highly specific and detailed. "
                        "Include: subject, action/pose, clothing, facial expression, environment/setting, "
                        "lighting, camera angle, time of day. "
                        "GOOD example: 'a young woman with long brown hair sitting at a wooden coffee shop table, "
                        "warm genuine smile, wearing a cream knit sweater, holding a latte, afternoon golden hour "
                        "sunlight streaming through window, shallow depth of field, eye level shot' "
                        "BAD example: 'a woman in a cafe' (too vague, will produce poor results)"
                    ),
                },
            },
            "required": ["prompt"],
        }

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

    async def _analyze_image(self, img_b64: str, original_prompt: str) -> tuple[str, int]:
        """Analyze image and return (description, score 1-10)."""
        try:
            payload = {
                "model": VISION_MODEL,
                "prompt": (
                    f"The intended image was: '{original_prompt}'.\n"
                    f"1) Describe what you see in 1-2 sentences.\n"
                    f"2) Rate how well it matches the prompt from 1 to 10.\n"
                    f"3) List any flaws (bad anatomy, wrong subject, artifacts).\n"
                    f"End your response with exactly: SCORE: X (where X is 1-10)"
                ),
                "images": [img_b64],
                "stream": False,
            }
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=60),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        text = data.get("response", "")
                        # Extract score from response
                        match = re.search(r"SCORE:\s*(\d+)", text, re.IGNORECASE)
                        score = int(match.group(1)) if match else 5
                        score = max(1, min(10, score))
                        return text, score
            return "Analyse fehlgeschlagen.", 5
        except Exception as e:
            logger.warning(f"Image analysis failed: {e}")
            return "Analyse nicht verfuegbar.", 5

    async def _generate_once(self, enhanced_prompt: str, seed: int = -1) -> dict | str:
        """Generate a single image. Returns API data dict or error string."""
        payload = {
            "prompt": enhanced_prompt,
            "negative_prompt": self._DEFAULT_NEGATIVE,
            "width": 512,
            "height": 768,
            "steps": 50,
            "cfg_scale": 7,
            "sampler_name": "DPM++ SDE Karras",
            "seed": seed,
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
                    return f"SD API Fehler (Status {resp.status}): {error_text[:300]}"
                return await resp.json()

    async def execute(self, prompt: str, **kwargs) -> str:
        try:
            self._output_dir.mkdir(parents=True, exist_ok=True)

            enhanced_prompt = (
                f"(RAW photo, photorealistic:1.3), (candid photo, shot on iPhone:1.2), "
                f"{prompt}, "
                f"(natural lighting:1.1), (shallow depth of field:1.1), "
                f"realistic skin texture, skin pores, lifelike texture, "
                f"(slight film grain:0.8), authentic, 8k uhd"
            )

            logger.info(f"Enhanced prompt: {enhanced_prompt}")

            best_result = None  # (filename, analysis_text, score, img_b64)

            for attempt in range(MAX_ATTEMPTS):
                logger.info(f"Generation attempt {attempt + 1}/{MAX_ATTEMPTS}")

                data = await self._generate_once(enhanced_prompt)
                if isinstance(data, str):
                    return data  # error

                images = data.get("images", [])
                if not images:
                    continue

                img_b64 = images[0]
                img_data = base64.b64decode(img_b64)
                filename = f"img_{int(time.time() * 1000)}.png"
                filepath = self._output_dir / filename
                filepath.write_bytes(img_data)

                logger.info(f"Image saved: {filepath}")

                # Analyze
                analysis, score = await self._analyze_image(img_b64, prompt)
                logger.info(f"Attempt {attempt + 1} score: {score}/10")

                if best_result is None or score > best_result[2]:
                    # Delete previous best if it exists and is different
                    if best_result and best_result[0] != filename:
                        old_path = self._output_dir / best_result[0]
                        old_path.unlink(missing_ok=True)
                    best_result = (filename, analysis, score, img_b64)
                else:
                    # This attempt is worse, delete it
                    filepath.unlink(missing_ok=True)

                # Good enough - stop retrying
                if score >= 7:
                    logger.info(f"Score {score} >= 7, accepting image")
                    break

                logger.info(f"Score {score} < 7, retrying...")

            if not best_result:
                return "Stable Diffusion hat kein Bild zurueckgegeben."

            filename, analysis, score, _ = best_result
            logger.info(f"Final image: {filename} (score: {score}/10)")

            return (
                f"Bild generiert (Qualitaet: {score}/10).\n"
                f"![Generiertes Bild](/generated/{filename})\n\n"
                f"**Analyse:** {analysis}"
            )

        except aiohttp.ClientConnectorError:
            return "Fehler: Stable Diffusion API ist nicht erreichbar."
        except Exception as e:
            logger.exception("Image generation failed")
            return f"Fehler bei der Bildgenerierung: {e}"
