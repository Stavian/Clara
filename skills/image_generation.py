import asyncio
import logging
import base64
import re
import time
from pathlib import Path

import aiohttp

from config import Config
from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)

VISION_MODEL = "moondream"
OLLAMA_BASE_URL = "http://localhost:11434"
MAX_ATTEMPTS = 2  # Reduced from 3 — diminishing returns on 3rd attempt


class ImageGenerationSkill(BaseSkill):
    def __init__(self, sd_api_url: str, output_dir: Path):
        self._sd_api_url = sd_api_url.rstrip("/")
        self._output_dir = output_dir
        self._session: aiohttp.ClientSession | None = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

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
            "Das Bild wird automatisch analysiert und bei schlechter Qualitaet automatisch neu generiert."
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
        "deformed, distorted, disfigured, bad anatomy, bad proportions, "
        "extra limb, missing limb, extra fingers, mutated hands and fingers, "
        "poorly drawn hands, poorly drawn face, "
        "text, watermark, signature, logo, "
        "professional photography, dslr, studio lighting, studio photo, "
        "bokeh, cinematic, masterpiece, 8k, 4k, ultra hd, "
        "airbrushed, plastic skin, overly smooth skin, perfect skin, "
        "cgi, 3d render, cartoon, anime, illustration, painting, "
        "(asian, chinese, japanese, korean, east asian features:1.3)"
    )

    async def _analyze_image(self, img_b64: str, original_prompt: str) -> tuple[str, int]:
        """Analyze image and return (description, score 1-10)."""
        t0 = time.perf_counter()
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
            session = await self._get_session()
            async with session.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=60),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    text = data.get("response", "")
                    match = re.search(r"SCORE:\s*(\d+)", text, re.IGNORECASE)
                    score = int(match.group(1)) if match else 5
                    score = max(1, min(10, score))
                    logger.info(f"[TIMING] Analysis: {time.perf_counter() - t0:.1f}s → score {score}/10")
                    return text, score
            return "Analyse fehlgeschlagen.", 5
        except Exception as e:
            logger.warning(f"Image analysis failed: {e}")
            return "Analyse nicht verfuegbar.", 5

    async def _generate_once(self, enhanced_prompt: str, seed: int = -1) -> dict | str:
        """Generate a single image using Hi-Res Fix: 1024→2048. Returns API data dict or error string."""
        # Hi-Res Fix pipeline:
        # Pass 1 — generate clean composition at 1024×1024 (SDXL native res, ~35 steps)
        # Pass 2 — upscale to 2048×2048 with 25 denoising steps (much faster than direct 2048 generation)
        # iPhone 6 aesthetic: portrait format, no Hi-Res Fix (softness helps realism),
        # DPM++ 2M Karras for natural results, low CFG to avoid over-processed look
        payload = {
            "prompt": enhanced_prompt,
            "negative_prompt": self._DEFAULT_NEGATIVE,
            "width": 768,
            "height": 1024,
            "steps": 30,
            "cfg_scale": 5.5,
            "sampler_name": "DPM++ 2M Karras",
            "seed": seed,
            "batch_size": 1,
            "n_iter": 1,
            "override_settings": {
                "CLIP_stop_at_last_layers": 1,
                "sd_model_checkpoint": Config.SD_MODEL,
            },
        }

        t0 = time.perf_counter()
        session = await self._get_session()
        async with session.post(
            f"{self._sd_api_url}/sdapi/v1/txt2img",
            json=payload,
            timeout=aiohttp.ClientTimeout(total=600),
        ) as resp:
            elapsed = time.perf_counter() - t0
            if resp.status != 200:
                error_text = await resp.text()
                return f"SD API Fehler (Status {resp.status}): {error_text[:300]}"
            data = await resp.json()
            logger.info(f"[TIMING] SD generation (1024 base + 2048 hi-res): {elapsed:.1f}s")
            return data

    async def execute(self, prompt: str, **kwargs) -> str:
        try:
            t_total = time.perf_counter()
            self._output_dir.mkdir(parents=True, exist_ok=True)

            enhanced_prompt = (
                f"candid mobile phone photo, shot on iPhone 6, f/2.2 aperture, "
                f"2010s aesthetic, casual snapshot, natural skin texture, "
                f"european caucasian western european features, "
                f"{prompt}, "
                f"casual lighting, slight motion blur, film grain, grainy, "
                f"realistic skin pores, lifelike texture, authentic"
            )

            logger.info(f"Enhanced prompt: {enhanced_prompt}")

            best_result = None  # (filename, analysis_text, score, img_b64)
            loop = asyncio.get_event_loop()

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

                # Write file in executor
                await loop.run_in_executor(None, filepath.write_bytes, img_data)

                logger.info(f"Image saved: {filepath}")

                # Analyze
                analysis, score = await self._analyze_image(img_b64, prompt)
                logger.info(f"Attempt {attempt + 1} score: {score}/10")

                if best_result is None or score > best_result[2]:
                    # Delete previous best if it exists and is different
                    if best_result and best_result[0] != filename:
                        old_path = self._output_dir / best_result[0]
                        await loop.run_in_executor(None, lambda p=old_path: p.unlink(missing_ok=True))
                    best_result = (filename, analysis, score, img_b64)
                else:
                    # This attempt is worse, delete it
                    await loop.run_in_executor(None, lambda p=filepath: p.unlink(missing_ok=True))

                # Good enough - stop retrying
                if score >= 7:
                    logger.info(f"Score {score} >= 7, accepting image")
                    break

                logger.info(f"Score {score} < 7, retrying...")

            if not best_result:
                return "Stable Diffusion hat kein Bild zurueckgegeben."

            filename, analysis, score, _ = best_result
            total = time.perf_counter() - t_total
            logger.info(f"[TIMING] Total: {total:.1f}s — final image: {filename} (score: {score}/10)")

            return (
                f"Bild generiert (Qualitaet: {score}/10, Zeit: {total:.0f}s).\n"
                f"![Generiertes Bild](/generated/{filename})\n\n"
                f"**Analyse:** {analysis}"
            )

        except aiohttp.ClientConnectorError:
            return "Fehler: Stable Diffusion API ist nicht erreichbar."
        except Exception as e:
            logger.exception("Image generation failed")
            return f"Fehler bei der Bildgenerierung: {e}"
