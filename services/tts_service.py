import re
import uuid
import logging
from pathlib import Path

import edge_tts

logger = logging.getLogger(__name__)


def _clean_text_for_speech(text: str) -> str:
    """Strip markdown, code blocks, URLs and other non-speech content."""
    # Remove code blocks (```...```)
    text = re.sub(r'```[\s\S]*?```', '', text)
    # Remove inline code (`...`)
    text = re.sub(r'`[^`]+`', '', text)
    # Remove markdown images ![alt](url)
    text = re.sub(r'!\[[^\]]*\]\([^)]+\)', '', text)
    # Remove markdown links but keep text [text](url) -> text
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    # Remove URLs
    text = re.sub(r'https?://\S+', '', text)
    # Remove markdown headers (### etc)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    # Remove bold/italic markers
    text = re.sub(r'\*{1,3}([^*]+)\*{1,3}', r'\1', text)
    text = re.sub(r'_{1,3}([^_]+)_{1,3}', r'\1', text)
    # Remove excessive whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


async def generate_tts(text: str, voice: str, output_dir: Path) -> str | None:
    """Generate TTS audio from text. Returns filename or None on failure."""
    cleaned = _clean_text_for_speech(text)
    if not cleaned or len(cleaned) < 2:
        return None

    try:
        filename = f"{uuid.uuid4().hex}.mp3"
        output_path = output_dir / filename

        communicate = edge_tts.Communicate(cleaned, voice)
        await communicate.save(str(output_path))

        logger.info(f"TTS generated: {filename} ({len(cleaned)} chars)")
        return filename
    except Exception as e:
        logger.warning(f"TTS generation failed: {e}")
        return None
